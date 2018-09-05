'use strict';

require('dotenv').config();

const queries = require('./dbqueries');

const Snoowrap = require('snoowrap');
const Snoostorm = require('snoostorm');
const https = require('https');
const cheerio = require('cheerio');
const cheerioTableparser = require('cheerio-tableparser');
const mysql = require('mysql');

const r = new Snoowrap({
    userAgent: process.env.USER_AGENT,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    username: process.env.REDDIT_USER,
    password: process.env.REDDIT_PASS
});
const client = new Snoostorm(r);

const comments = client.CommentStream({
    subreddit: 'scooty14',
    results: 25
});

comments.on('comment', (comment) => {
    let c = comment.body.match(/^!(?:camera|player|cam|settings) ((?:\/u\/)?[a-zA-Z0-9_\-]+)/)
    if (c) {
        let name = c[1].toLowerCase();
        if (name.startsWith('/u/')) {
            
        }
        else {
            sendInfoPro(comment, name);
        }
        return;
    }
    c = comment.body.match(/^!(?:team|teamcam) ((?:\/u\/)?[a-zA-Z0-9_\-]+)/);
    if (c) {
        let team = c[1].toLowerCase();;
        sendInfoTeam(comment, team);
        return;
    }
    
    
});


const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    typeCast: function castField( field, useDefaultTypeCasting ) {
        if ((field.type === "BIT") && (field.length === 1)) {
            let bytes = field.buffer();
            return bytes[0]===1?'yes':'no';
        }
        return useDefaultTypeCasting();
    }
});


db.connect(err => {
    if (err) throw err;
    console.log("Connected to DB!");
    fetchPros();
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
}

function sendInfoPro(comment, name) {
    let result = ''
    db.query(queries.GET_PRO, ['%' + name + '%'], (error, results, fields) => {
        if (error) {         
            console.log(`Problem updating player ${name}, SQL: ${error.sql}`);
            return;
        }        
        result = buildTable(results);
        result+='I am a bot created by /u/scooty14, [DATA SOURCE](https://liquipedia.net/rocketleague/List_of_player_camera_settings)'
        if (comment) {
            comment.reply(result);
        }
    }); 
}

function sendInfoTeam(comment, name) {
    let result = ''
    db.query(queries.GET_TEAM, ['%' + name + '%', name], (error, results, fields) => {
        if (error) {         
            console.log(`Problem updating player ${name}, SQL: ${error.sql}`);
            return;
        }        
        results.sort((a,b) => {
            return a['rawfullteam'].localeCompare(b['rawfullteam']);
            });
        result = buildTable(results);
        result+='I am a bot created by /u/scooty14, [DATA SOURCE](https://liquipedia.net/rocketleague/List_of_player_camera_settings)'
        if (comment) {
            comment.reply(result);
        }
        else {
            console.log(result);
        }
    }); 
}

function normalize(str) {
    return str.toLowerCase().replace(/\s+/g, '');
}

function updateRedditPlayer(info) {
    db.query(queries.UPDATE_REDDIT, info, (error, results, fields) => {
        if (error) {         
            console.log(`Problem updating player ${info['rawname']}, SQL: ${error.sql}`);
            return;
        }
    });  
}

function updateProPlayer(info) {
    db.query(queries.UPDATE_PRO, info, (error, results, fields) => {
        if (error) {         
            console.log(`Problem updating player ${info['rawname']}, SQL: ${error.sql}`);
            return;
        }
    });  
}

function fetchPros() {
    let options = {
        host: 'google.com',
        path: '/'
    }
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
                    let info = {}
                    info['rawname'] = cheerio.load(table[0][i])('p').text().trim();
                    info['name'] = normalize(info['rawname']);
                    info['rawteam'] = cheerio.load(table[1][i])('.team-template-text').text().trim();
                    info['team'] = normalize(info['rawteam']);
                    info['rawfullteam'] = (cheerio.load(table[1][i])('.team-template-image a').attr('title') || '').trim()
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
                    updateProPlayer(info);
                }
            });
            console.log('Info from liquipedia fetched');
        });
    }).on('error', err => {
        console.log(err.message);
    });
}

function buildTable(results) {
    let result = '';
    for (let row of results) {
        let line='';
        if (result==='') {
            for (let key in row) {
                if (row.hasOwnProperty(key)) {
                    if (line!=='') {
                        result+='|';
                        line+='|';
                    }
                    result+=convertKeyTable[key];
                    line+=':-:';
                }
            }
            result+='  \n';
            line+='  \n';
            result+=line;
            line='';
        }
        for (let key in row) {
            if (row.hasOwnProperty(key)) {
                if (line!=='') {
                    line+='|';
                }
                line+=row[key];
            }
        }
        line+='  \n';
        result+=line;
    }
    result+='  \n';
    return result;
}