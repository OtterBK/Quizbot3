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

exports.initialize = async () => {
    return await pool.connect(err => {
        if (err) {
          logger.error(`Failed to connect db err: ${err}`);
          return true;
        } else {
          logger.info(`Connected to db!`);
          return false;
        }
    });
}

exports.executeQuery = async (query) => {
    return pool.query(query);
}

exports.selectOption = async (guild_id, option_fields) => {

  const query_string = 
  `select ${option_fields} from tb_option 
    where guild_id = ${guild_id};`

  return sendQuery(query_string);

}

exports.updateOption = async (guild_id, option_fields, option_values) => {

  const query_string =
  `insert into tb_option (guild_id,${option_fields}) values (${guild_id},${option_values}) 
    on conflict (guild_id)
    DO UPDATE set (${option_fields}) = (${option_values}) 
    where tb_option.guild_id = ${guild_id};`

    return sendQuery(query_string); 

}

function sendQuery(query_string)
{
  return pool.query(query_string)
  .then((result) =>
  {
    return result;
  })
  .catch(err => 
  {
    logger.error(`query error, query: ${query_string}\nerr: ${err}`);
    return undefined;
  });
}