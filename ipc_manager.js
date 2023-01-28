'use strict'

//외부 모듈
const { messageType } = require('discord-hybrid-sharding');

//로컬 모듈
const logger = require('./logger.js')('IPCManager');
const quiz_system = require('./quiz_system.js');

/** 
 * 샤딩으로인한 공유 객체 및 이벤트 관리
 */
let bot_client = undefined;

//공유 오브젝트
let sync_objects = new Map();

let guild_count;
let local_play_count;
let multi_play_count;

exports.IPC_MESSAGE_TYPE = {
    CHECK_STATUS: 0,
    SYNC_STATUS: 1,
}

exports.sync_objects = sync_objects;

exports.initialize = (client) =>
{
    if(client == undefined)
    {
        logger.error(`Failed to Initialize Quiz system. ${'Client is undefined'}`);
        return false;
    }

    bot_client = client;
    bot_client.cluster.on('message', message => {

        if(message.ipc_message_type == exports.IPC_MESSAGE_TYPE.CHECK_STATUS)
        {
            message.reply({ 
                guild_count: bot_client.guilds.cache.size,  
                local_play_count: quiz_system.getLocalQuizSessionCount(),
                multi_play_count: quiz_system.getMultiplayQuizSessionCount(),
            });
        }
        else if(message.ipc_message_type == exports.IPC_MESSAGE_TYPE.SYNC_STATUS)
        {
            const status = message.status;
            sync_objects.set('guild_count', status.guild_count);
            sync_objects.set('local_play_count', status.local_play_count);
            sync_objects.set('multi_play_count', status.multi_play_count);
        }
    });
}

