'use strict';

require('dotenv').config();

const queries = require('./dbqueries');

const Snoowrap = require('snoowrap');
const https = require('https');
const cheerio = require('cheerio');
const cheerioTableparser = require('cheerio-tableparser');
const mysql = require('mysql');

const helpText =
`
* Type **'help'** to display this  \n  \n
------  \n
* Type **'delete'** to delete your camera settings  \n  \n
------  \n
* Type your camera settings to save them  \n
    **Message template:**  \n
    > shake no  
    > fov 90  \n
    > height 100  \n
    > angle -5  \n
    > distance 240  \n 
    > stiffness 0.0  \n
    > swivel 1.0  \n
    > transition 1  \n
    > toggle yes  \n  \n
    
    If you want to update only some values, delete lines you don't want to update  \n
    Click [HERE](https://www.reddit.com/message/compose/?to=rl-camera-bot&subject=set&message=shake no%0Afov 90%0Aheight 110%0Aangle -3%0Adistance 260%0Astiffness 0.7%0Aswivel 3.2%0Atransition 1%0Atoggle yes) to set quicker  \n
------  \n
* Type **'-player name'** or **'-player /u/reddituser'** to display camera settings of a player  \n
    You can also use *-camera, -player, -cam, -settings, -p, -c*, they are all the same \n 
------  \n
* Type **'-players name1, name2, /u/reddituser'** to display camera settings of multiple players  \n
    You can also use *-cameras, -players, -cams, -ps, -cs*, they are all the same  \n 
------  \n
* Type **'-team name'** to display camera settings of a team  \n
    You can also use *-team, -teamcam, -teamcamera, -tc, -t*, they are all the same  \n
------  \n
* Type **'-teams team1 team2'** to display camera settings of multiple teams  \n
    You can also use *-teams, -teamcams, -teamcameras, -tcs, -ts*, they are all the same  \n
------  \n
* You don't have to type whole names, if you want cameras of Flipsid3 Tactics, **-t F3, -t flip or -t SiDeTaCtIc** will work  \n
    Don't use spaces in names, just **letter and numbers**  \n
------  \n
* **You can use any command except help, delete and setting camera in comments, just mention me in the comment**  \n
------  

`;

const SIGNATURE = 'I am a bot created by /u/scooty14, [DATA SOURCE](https://liquipedia.net/rocketleague/List_of_player_camera_settings).  \nIf you need help with commands, [send me a PM with text \'help\'](https://www.reddit.com/message/compose/?to=rl-camera-bot&message=help&subject=help)';

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
            if (messages.length>0) console.log('Got ' + messages.length + ' new message(s)');
            for (let message of messages) {
                let type = message.constructor.name.toLowerCase();
                if (type === 'comment') {
                    reddit.getMessage(message.name).markAsRead()
                     .catch(error => console.log(error));
                    handleComment(message)
                        .then(reply => message.reply(reply))
                        .catch(error => console.log(error));
                }
                else if (type === 'privatemessage') {
                    message.markAsRead()
                        .catch(error => console.log(error));
                    handleMessage(message)
                        .then(reply => message.reply(reply))
                        .catch(error => console.log(error));
                }
            }
        })
        .catch(error => console.log(error));
}

function composeReply(...tables) {
    let found_players = false;
    for (let table of tables) {
        if (!table.empty) found_players=true;
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
    for (let table of tables) result+=table.body||'';
    result+='  \n  \n';
    return Promise.resolve(result + SIGNATURE);
}

function handleComment(comment, sendUnrecognized=true) {
    return new Promise((resolve, reject) => {
        let match = comment.body.match(/(?:-camera|-player|-cam|-settings|-p|-c) ((?:\/?u\/)?[a-zA-Z0-9_\-]+)/);
        if (!match) match = comment.body.match(/(?:-cameras|-players|-cams|-ps|-cs) ((?:(?:\/?u\/)?[a-zA-Z0-9_\-]+ ?){1,10})/);
        if (match) {
            let players = match[1].toLowerCase().split(' ');
            let reddit_names = [];
            let pro_names = [];
            for (let p of players) {
                if (p.toLowerCase().startsWith('u/')) p='/'+p;
                if (p.toLowerCase().startsWith('/u/')) reddit_names.push(p);
                else pro_names.push(p);
            }
            if (pro_names.length===0) {
                getInfoReddit(reddit_names)
                    .then(info => {
                        return buildTableBody(info)
                    }).then(table => {
                        return composeReply(table)
                    }).then(reply => resolve(reply))
                    .catch(error => reject(error));
            }
            else if (reddit_names.length===0) {
                getInfoPro(pro_names)
                    .then(info => {
                        return buildTableBody(info)
                    }).then(table => {
                        return composeReply(table)
                    }).then(reply => resolve(reply))
                    .catch(error => reject(error));
            }
            else {
                getInfoPro(pro_names)
                    .then(infoPros => {
                        getInfoReddit(reddit_names)
                            .then(infoReddit => {
                                return buildTableBody(infoReddit);
                            }).then(redditTable => {
                                buildTableBody(infoPros)
                                    .then(proTable => {
                                        return composeReply(proTable, redditTable);
                                    }).then(reply => resolve(reply))
                                    .catch(error => reject(error))
                            })
                            .catch(error => reject(error))
                    })
                    .catch(error => reject(error))
            }
            return;
        }
        match = comment.body.match(/(?:-team|-teamcam|-teamcamera|-tc|-t) ([a-zA-Z0-9_\-]+)/);
        if (!match) match = comment.body.match(/(?:-teams|-teamcams|-teamcameras|-tcs|-ts) ((?:[a-zA-Z0-9_\-]+ ?){1,10})/);
        if (match) {
            let teams = match[1].toLowerCase().split(' ');
            getInfoTeams(teams)
                .then(info => {
                    return buildTableBody(info);
                }).then(table => {
                    return composeReply(table);
                }).then(reply =>resolve(reply))
                .catch(error => console.log(error));
            return;
        }
        if (sendUnrecognized && comment.body.includes('u/'+process.env.REDDIT_USER)) {
            resolve('You mentioned me in your comment, but I can\'t parse your query, sorry. Please, try again.  \n' + SIGNATURE);
            return;
        }
        reject('No match of pattern');
    });
}

function handleMessage(message) {
    return new Promise((resolve, reject) => {
        if (message.body.toLowerCase().startsWith('delete')) {
            deleteReddit('/u/' + message.author.name)
                .then(name => {
                    resolve('Deleted all info about you, ' + message.author.name + '.  \n  \n' + SIGNATURE);
                })
                .catch(error => {
                    resolve('Something went wrong, contact /u/scooty14 or try again later.');
                    console.log(error);
                });
            return;
        }
        if (message.body.toLowerCase().startsWith('help')) {
            resolve(helpText + SIGNATURE);
            return;
        }
        handleComment(message, false) // if user didn't request any settings
            .then((solution) => {
                resolve(solution);
            })
            .catch((error) => {
                let lines = message.body.split('\n');
                let reply = '';
                getInfoReddit(['/u/' + message.author.name.toLowerCase()])
                    .then(info => {
                        if (info.length===0) return Promise.resolve({
                            'rawname': '/u/' + message.author.name,
                            'name': '/u/' + message.author.name.toLowerCase()
                        });
                        else return Promise.resolve(info[0]);
                    }).then(info => {
                        for (let line of lines) {
                            let p = line.toLowerCase().split(' ');
                            if (p.length < 2) continue;
                            if (p[0].includes('shake')) {
                                if (p[1] === 'yes') info['shake']=true;
                                else if (p[1] === 'no') info['shake']=false;
                            }
                            if (p[0].includes('fov')) info['fov'] = parseInt(p[1]);
                            if (p[0].includes('height')) info['height'] = parseInt(p[1]);
                            if (p[0].includes('angle')) info['angle'] = parseFloat(p[1]);
                            if (p[0].includes('distance')) info['distance'] = parseInt(p[1]);
                            if (p[0].includes('stiffness')) info['stiffness'] = parseFloat(p[1]);
                            if (p[0].includes('swivel')) info['swivel'] = parseFloat(p[1]);
                            if (p[0].includes('transition')) info['transition'] = parseFloat(p[1]);
                            if (p[0].includes('toggle')) {
                                if (p[1] === 'yes') info['balltoggle']=true;
                                else if (p[1] === 'no') info['balltoggle']=false;
                            }
                        }
                        return Promise.resolve(info);
                    }).then(info => {
                        return updateRedditPlayer(info)
                    }).then(info => {
                        return buildTableBody([info]);
                    }).then(table => {
                        return composeReply(table)
                    }).then(tail => {
                        reply+='If you need help, semd me a message with text "help"  \n';
                        reply+='These are your saved camera settings:  \n  \n';
                        resolve(reply + tail);
                    }).catch(error => {
                        reject(error)
                    });
            });
    });
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
            if (!bytes) return null;
            return bytes[0]===1;
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
    distance: 240,
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
                resolve(results);
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
            let query = queries.GET_REDDIT;
            for (let i=0; i<names.length; i++) {
                query+=' OR name= '+ pool.escape(names[i]);
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
                resolve(results);
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
            connection.query(query, (error, results, fields) => {
                connection.release();
                if (error) {
                    reject('Error getting teams info');
                    return;
                }
                results.sort((a,b) => {
                    return a['rawfullteam'].localeCompare(b['rawfullteam']);
                });
                resolve(results);
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
                resolve(info);
            });
        });
    });
}

function deleteReddit(name) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, connection) => {
            if(err) {
                reject('Reddit player delete failed');
                return;
            }
            name = name.toLowerCase();
            connection.query(queries.DELETE_REDDIT, {name:name}, (error, results, fields) => {
                connection.release();
                if (error) {
                    console.log(error.sql);
                    reject(`Problem deleting player ${name}, SQL: ${error.sql}`);
                }
                resolve(name);
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
                resolve(info);
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
            for (let key in convertKeyTable) {
                if (convertKeyTable.hasOwnProperty(key)) {
                    if (line) line+='|';
                    if (typeof row[key] === "boolean") {
                        if (row[key]) line+="yes";
                        else line+="no";
                    }
                    else {
                        if (row[key]!==undefined && row[key]!==null) line+=row[key];
                    }
                }
            }
            line+='  \n';
            result.body+=line;
        }
        resolve(result);
    });

}

fetchPros();
let fetchProsInterval = setInterval(() => {
    fetchPros();
}, 24*60*60*1000);

let checkMessagesInterval = setInterval(() => {
    parseNewMessages();
}, 10*1000);