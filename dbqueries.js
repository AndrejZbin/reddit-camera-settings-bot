'use strict';

module.exports = {
    UPDATE_PRO: 'REPLACE INTO pro_players SET ?;',
    UPDATE_REDDIT: 'REPLACE INTO reddit_players VALUES (rawname, name, shake, fov, height, angle, distance, stiffness, swivel, transition, balltoggle) VALUES (?,?,?,?,?,?,?,?,?,?,?);',
    GET_PRO: 'SELECT rawname,rawfullteam,shake,fov,height,angle,distance,stiffness,swivel,transition,balltoggle FROM pro_players WHERE name LIKE ?;',
    GET_TEAM: 'SELECT rawname,rawfullteam,shake,fov,height,angle,distance,stiffness,swivel,transition,balltoggle FROM pro_players WHERE fullteam LIKE ? OR team=?;',
}