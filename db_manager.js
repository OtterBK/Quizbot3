'use strict'

//외부 modules
const { ThreadChannel } = require('discord.js');
const { reject } = require('lodash');
const pg = require('pg');

//로컬 modules
const PRIVATE_CONFIG = require('./private_config.json');
const { SYSTEM_CONFIG } = require('./system_setting.js');
const logger = require('./logger.js')('DBManager');

const pool = new pg.Pool({
  host: PRIVATE_CONFIG.DB.HOST,
  user: PRIVATE_CONFIG.DB.USER,
  password: PRIVATE_CONFIG.DB.PASSWORD,
  database: PRIVATE_CONFIG.DB.DATABASE,
  port: PRIVATE_CONFIG.DB.PORT,
  max: SYSTEM_CONFIG.pg_max_pool_size,
});

let is_initialized = false;

exports.initialize = () => {
    return new Promise((resolve, reject) => {
      pool.connect(err => {
        if (err) {
          logger.error(`Failed to connect db err: ${err}`);
          is_initialized = false;
        } else {
          logger.info(`Connected to db!`);
          is_initialized = true;
        }
        resolve(is_initialized);
      });
    });
}

exports.executeQuery = async (query, values) => {
    return pool.query(query, values);
}

//옵션쪽은 어차피 고정값이니깐 placeholder 사용하지 말자, 건드리기 두렵다
exports.selectOption = async (guild_id, option_fields) => {

  const query_string = 
  `select ${option_fields} from tb_option 
    where guild_id = ${guild_id};`;

  return sendQuery(query_string);

}

exports.updateOption = async (guild_id, option_fields, option_values) => {

  const query_string =
  `insert into tb_option (guild_id,${option_fields}) values (${guild_id},${option_values}) 
    on conflict (guild_id)
    DO UPDATE set (${option_fields}) = (${option_values}) 
    where tb_option.guild_id = ${guild_id};`;

    return sendQuery(query_string); 

}

//option이랑 쿼리 날리는 방식이 다르다...쏘리
exports.selectQuizInfo = async (key_fields, value_fields) => {

  const query_string = 
  `select * 
    from tb_quiz_info
    where creator_id = $1 and is_use = true`;

  return sendQuery(query_string, value_fields);

}

exports.insertQuizInfo = async (key_fields, value_fields) => {

  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }
  const query_string = 
  `insert into tb_quiz_info (${key_fields}) values (${placeholders}) 
  returning quiz_id`;

  return sendQuery(query_string, value_fields);

}

exports.updateQuizInfo = async (key_fields, value_fields) => {
  
  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }

  const query_string = 
  `UPDATE set (${key_fields}) = (${placeholders}) 
    where tb_quiz_info.quiz_id = $1;
    returning quiz_id`;

  return sendQuery(query_string, value_fields);

}

exports.disableQuizInfo = async (quiz_id) => {
  
  const query_string = 
  `UPDATE tb_quiz_info set is_use = false 
    where quiz_id = $1;`;

  return sendQuery(query_string, [quiz_id]);

}

exports.selectQuestionInfo = async (quiz_id, key_fields) => {

  const query_string =
  `select ${key_fields}
    from tb_question_info
    where quiz_id = ${quiz_id}`;
    
  return sendQuery(query_string);

}

const sendQuery = (query_string, values=[]) =>
{
  if(is_initialized == false)
  {
    return new Promise((resolve, reject) => {
      resolve(undefined);
    });
  }

  return pool.query(query_string, values)
  .then((result) =>
  {
    return result;
  })
  .catch(err => 
  {
    logger.error(`query error, query: ${query_string}, values: ${values}\nerr: ${err}`);
    return undefined;
  });
}
