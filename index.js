'use strict';

require('dotenv').config();

const queries = require('./dbqueries');

const Snoowrap = require('snoowrap');
const https = require('https');
const cheerio = require('cheerio');
const cheerioTableparser = require('cheerio-tableparser');
const mysql = require('mysql');

const SIGNATURE = 'I am a bot created by /u/scooty14, [DATA SOURCE](https://liquipedia.net/rocketleague/List_of_player_camera_settings)';

const reddit = new Snoowrap({
    userAgent: process.env.USER_AGENT,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    username: process.env.REDDIT_USER,
    password: process.env.REDDIT_PASS
});

function parseNewMessages() {
    reddit.getUnreadMessages()
        .then(messages => {
            console.log('Got ' + messages.length + ' new messages');
            for (let message of messages) {
                let type = message.constructor.name.toLowerCase();
                if (type === 'comment') {
                    reddit.getMessage(message.name).markAsRead();
                    handleComment(message);
                }
                else if (type === 'privatemessage') {
                    message.markAsRead();
                    handleMessage(message);
                }
            }
        })
        .catch(error => console.log(error));
}

function composeReply(...infos) {
    let found_players = false;
    for (let info of infos) {
        if (!info.empty) found_players=true;
    }
    if (!found_players) return Promise.resolve('No players found matching your query  \n  \n' + SIGNATURE);
    let line1='';
    let line2='';
    for (let key in convertKeyTable) {
        if (convertKeyTable.hasOwnProperty(key)) {
            if (line1) line1+='|';
            if (line2) line2+='|';
            line1+=convertKeyTable[key];
            line2+=':-:';
        }
    }
    line1+='  \n';
    line2+='  \n';
    let result = line1 + line2;
    for (let info of infos) result+=info.body||'';
    return Promise.resolve(result + SIGNATURE);
}

function handleComment(comment, sendUnrecognized=true) {
    let match = comment.body.match(/(?:-camera|-player|-cam|-settings|-p|-c) ((?:\/u\/)?[a-zA-Z0-9_\-]+)/);
    if (!match) match = comment.body.match(/(?:-cameras|-players|-cams|-ps|-cs) ((?:(?:\/u\/)?[a-zA-Z0-9_\-]+ ?){1,10})/);
    if (match) {
        let players = match[1].toLowerCase().split(' ');
        let reddit_names = [];
        let pro_names = [];
        for (let p of players) {
            if (p.toLowerCase().startsWith('/u/')) reddit_names.push(p);
            else pro_names.push(p);
        }
        if (!pro_names) {
            getInfoReddit(match)
                .then(composeReply)
                .then(reply => comment.reply(reply))
                .catch(error => console.log(error));
        }
        else if (!reddit_names) {
            getInfoPro(match)
                .then(composeReply)
                .then(reply => comment.reply(reply))
                .catch(error => console.log(error));
        }
        else {
            getInfoPro(pro_names)
                .then(infoPros => {
                    getInfoReddit(reddit_names)
                        .then(infoReddit => {
                            composeReply(infoPros, infoReddit)
                                .then(reply => comment.reply(reply));
                        })
                        .catch(error => console.log(error))
                })
                .catch(error => console.log(error))
        }
        return true;
    }
    match = comment.body.match(/(?:-team|-teamcam|-teamcamera|-tc|-t) ([a-zA-Z0-9_\-]+)/);
    if (!match) comment.body.match(/(?:-teams|-teamcams|-teamcameras|-tcs|-ts) ([a-zA-Z0-9_\-]+ ){1,10}/);
    if (match) {
        let teams = match[1].toLowerCase().split(' ');
        getInfoTeams(teams)
            .then(composeReply)
            .then(reply => comment.reply(reply))
            .catch(error => console.log(error));
        return true;
    }
    if (sendUnrecognized) {
        comment.reply('You mentioned me in your comment, but I can\'t parse your query, sorry. Please, try again.  \n' + SIGNATURE);
    }
    return false;
}

function handleMessage(message) {
    if (!handleComment(message, false)) { // if user didn't request any settings

    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    acquireTimeout: 30000,
    typeCast: function castField( field, useDefaultTypeCasting ) {
        if ((field.type === "BIT") && (field.length === 1)) {
            let bytes = field.buffer();
            return bytes[0]===1?'yes':'no';
        }
        return useDefaultTypeCasting();
    }
});

const convertKeyTable = {
    rawname: 'Player\'s name',
    rawfullteam: 'Player\'s team',
    shake: 'Camera shake',
    fov: 'FOV',
    height: 'Height',
    angle: 'Angle',
    distance: 'Distance',
    stiffness: 'Stiffness',
    swivel: 'Swivel speed',
    transition: 'Transition speed',
    balltoggle: 'Toggle ball camera',
};

const cameraDefaults = {
    shake: false,
    fov: 90,
    height: 100,
    angle: -5,
    distance: -240,
    stiffness: 0.0,
    swivel: 2.5,
    transition: 1.0,
    balltoggle: true,
};

function getInfoPro(names) {
    return new Promise( (resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject('Cant get pool connection');
                return;
            }
            let query = queries.GET_PRO;
            for (let i=0; i<names.length; i++) {
                query+=' OR name LIKE '+ pool.escape('%' + names[i] + '%');
            }
            query+=';';
            connection.query(query, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject('Error getting pro players info ' + query);
                    return;
                }
                results.sort((a,b) => {
                    return a['rawname'].localeCompare(b['rawname']);
                });
                buildTableBody(results)
                    .then(table => resolve(table))
                    .catch(error => {
                        reject(error);
                    });
            });
        });
    });
}

function getInfoReddit(names) {
    return new Promise( (resolve, reject) => {
        pool.getConnection((err, connection) => {
            if (err) {
                reject('Cant get pool connection');
                return;
            }
            let query = queries.GET_PRO;
            for (let i=0; i<names.length; i++) {
                query+=' OR name LIKE '+ pool.escape('%' + names[i] + '%');
            }
            query+=';';
            connection.query(query, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject('Error getting reddit player info');
                    return;
                }
                results.sort((a,b) => {
                    return a['rawname'].localeCompare(b['rawname']);
                });
                buildTableBody(results)
                    .then(table => resolve(table))
                    .catch(error => {
                        reject(error);
                    });
            });
        });
    });
}

function getInfoTeams(names) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if(err) {
                reject('Cant get pool connection');
                return;
            }
            let query = queries.GET_TEAMS;
            for (let i=0; i<names.length; i++) {
                names[i]=normalize(names[i]);
                query+=' OR fullteam LIKE ' + pool.escape('%' + names[i] + '%') + ' OR team=' + pool.escape(names[i]);
            }
            query+=';';
            console.log(query);
            connection.query(query, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject('Error getting teams info');
                    return;
                }
                results.sort((a,b) => {
                    return a['rawfullteam'].localeCompare(b['rawfullteam']);
                });
                buildTableBody(results)
                    .then(table => resolve(table))
                    .catch(error => {
                        reject(error);
                    })
            });
        });
    });

}

function normalize(str) {
    return str.toLowerCase().replace(/[^\w]/g, '')
}

function updateRedditPlayer(info) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if(err) {
                reject('Reddit player update failed');
                return;
            }
            connection.query(queries.UPDATE_REDDIT, info, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject(`Problem updating player ${info['rawname']}, SQL: ${error.sql}`);
                }
                resolve();
            });
        });
    });
}

function updateProPlayer(info) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if(err) {
                reject('Pro player update failed');
                return;
            }
            connection.query(queries.UPDATE_PRO, info, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject('Problem updating player ' + info['rawname']);
                }
                resolve();
            });
        });
    });
}

function fetchPros() {
    let options = {
        host: 'google.com',
        path: '/'
    };
    console.log('Fetching info from liquipedia');
    https.get('https://liquipedia.net/rocketleague/List_of_player_camera_settings', res => {
        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });
        res.on('end', () => {
            let doc = cheerio.load(data);
            cheerioTableparser(doc);
            doc('table').each(function(i, elem) {
                let table = doc(this).parsetable();
                if (table.length !== 12) return;
                for (let i=1; i<table[0].length; i++) {
                    let info = {};
                    info['rawname'] = cheerio.load(table[0][i])('p').text().trim();
                    info['name'] = normalize(info['rawname']);
                    info['rawteam'] = cheerio.load(table[1][i])('.team-template-text').text().trim();
                    info['team'] = normalize(info['rawteam']);
                    info['rawfullteam'] = (cheerio.load(table[1][i])('.team-template-image a').attr('title') || '').trim();
                    info['fullteam'] = normalize(info['rawfullteam']);
                    info['shake'] = normalize(table[2][i]) === 'yes';
                    info['fov'] = parseInt(table[3][i]);
                    info['height'] = parseInt(table[4][i]);
                    info['angle'] = parseFloat(table[5][i]);
                    info['distance'] = parseInt(table[6][i]);
                    info['stiffness'] = parseFloat(table[7][i]);
                    info['swivel'] = parseFloat(table[8][i]);
                    info['transition'] = parseFloat(table[9][i]);
                    info['balltoggle'] = normalize(table[10][i]) === 'toggle';
                    updateProPlayer(info)
                        .then(() => {})
                        .catch(error => console.log(error));
                }
            });
            console.log('Info from liquipedia fetched');
        });
    }).on('error', err => {
        console.log(err.message);
    });
}

function buildTableBody(results) {
    return new Promise((resolve, reject) => {
        if (!results || results.length === 0) {
            resolve({
                empty: true,
                body:''
            });
            return;
        }
        let result = {
            empty:false,
            body:''
        };
        for (let row of results) {
            let line='';
            for (let key in row) {
                if (row.hasOwnProperty(key)) {
                    if (line) line+='|';
                    line+=row[key];
                }
            }
            line+='  \n';
            result.body+=line;
        }
        result.body+='  \n';
        resolve(result);
    });

}

fetchPros();
let fetchProsInterval = setInterval(() => {
    fetchPros();
}, 24*60*60*1000);

let checkMessagesInterval = setInterval(() => {
    parseNewMessages();
}, 5*1000);