'use strict';

//외부 modules
const { ThreadChannel } = require('discord.js');
const { reject } = require('lodash');
const pg = require('pg');

//로컬 modules
const PRIVATE_CONFIG = require('../../config/private_config.json');
const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('DBManager');

const pool = new pg.Pool({
  host: PRIVATE_CONFIG.DB.HOST,
  user: PRIVATE_CONFIG.DB.USER,
  password: PRIVATE_CONFIG.DB.PASSWORD,
  database: PRIVATE_CONFIG.DB.DATABASE,
  port: PRIVATE_CONFIG.DB.PORT,
  max: SYSTEM_CONFIG.pg_max_pool_size,
});

let is_initialized = false;

const sendQuery = (query_string, values=[]) =>
{
  if(is_initialized == false)
  {
    return new Promise((resolve, reject) => 
    {
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
};

exports.initialize = () => 
{
  return new Promise((resolve, reject) => 
  {
    pool.connect(err => 
    {
      if (err) 
      {
        logger.error(`Failed to connect db err: ${err}`);
        is_initialized = false;
      }
      else 
      {
        logger.info(`Connected to db!`);
        is_initialized = true;
      }
      resolve(is_initialized);
    });
  });
};

exports.executeQuery = async (query, values) => 
{
  return pool.query(query, values);
};

/** 옵션 */
//옵션쪽은 어차피 고정값이니깐 placeholder 사용하지 말자, 건드리기 두렵다
exports.selectOption = async (guild_id, option_fields) => 
{

  const query_string = 
  `select ${option_fields} from tb_option 
    where guild_id = ${guild_id};`;

  return sendQuery(query_string);

};

exports.updateOption = async (guild_id, option_fields, option_values) => 
{

  const query_string =
  `insert into tb_option (guild_id,${option_fields}) values (${guild_id},${option_values}) 
    on conflict (guild_id)
    DO UPDATE set (${option_fields}) = (${option_values}) 
    where tb_option.guild_id = ${guild_id};`;

  return sendQuery(query_string); 

};

/** User Quiz info */
//option이랑 쿼리 날리는 방식이 다르다...쏘리
exports.selectQuizInfo = async (creator_id) => 
{

  let query_string = 
  `select * 
    from tb_quiz_info
    where is_use = true and creator_id = $1
    order by quiz_id desc`;

  return sendQuery(query_string, [creator_id]);

};

exports.selectAllQuizInfo = async () => 
{

  let query_string = 
  `select * 
    from tb_quiz_info
    where is_use = true and is_private = false
    order by modified_time desc`;

  return sendQuery(query_string);

};

exports.insertQuizInfo = async (key_fields, value_fields) => 
{

  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }
  const query_string = 
  `insert into tb_quiz_info (${key_fields}) values (${placeholders}) 
  returning quiz_id`;

  return sendQuery(query_string, value_fields);

};

exports.updateQuizInfo = async (key_fields, value_fields, quiz_id) => 
{
  
  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }

  const query_string = 
  `UPDATE tb_quiz_info set (${key_fields}) = (${placeholders}) 
    where quiz_id = ${quiz_id}
    returning quiz_id`;

  return sendQuery(query_string, value_fields);

};

exports.disableQuizInfo = async (quiz_id) => 
{
  
  const query_string = 
  `UPDATE tb_quiz_info set is_use = false 
    where quiz_id = $1;`;

  return sendQuery(query_string, [quiz_id]);
};

exports.addQuizInfoPlayedCount = async (quiz_id) => 
{

  const query_string = 
  `UPDATE tb_quiz_info set played_count = played_count + 1, played_count_of_week = played_count_of_week + 1
    where quiz_id = $1;`;

  return sendQuery(query_string, [quiz_id]);

};


/** User QuestioN Info */ 
exports.selectQuestionInfo = async (value_fields) => 
{

  const query_string =
  `select *
    from tb_question_info
    where quiz_id = $1
    order by question_id asc`;
    
  return sendQuery(query_string, value_fields);

};
exports.insertQuestionInfo = async (key_fields, value_fields) => 
{

  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }
  const query_string = 
  `insert into tb_question_info (${key_fields}) values (${placeholders}) 
  returning question_id`;

  return sendQuery(query_string, value_fields);

};

exports.updateQuestionInfo = async (key_fields, value_fields, question_id) => 
{
  
  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }

  const query_string = 
  `UPDATE tb_question_info set (${key_fields}) = (${placeholders}) 
    where question_id = ${question_id}
    returning question_id`;

  return sendQuery(query_string, value_fields);
};

/** User QuestioN Info */ 
exports.updateQuizInfoModifiedTime = async (quiz_id) => 
{

  const query_string = 
  `UPDATE tb_quiz_info set modified_time = now()
    where quiz_id = $1;`;

  return sendQuery(query_string, [quiz_id]);
};

exports.deleteQuestionInfo = async (question_id) => 
{
  
  const query_string = 
  `delete from tb_question_info
    where question_id = $1`;

  return sendQuery(query_string, [question_id]);

};

exports.insertLikeInfo = async (key_fields, value_fields) => 
{

  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }
  const query_string = 
  `insert into tb_like_info (${key_fields}) values (${placeholders})`;

  return sendQuery(query_string, value_fields);
};

exports.selectLikeInfo = async (value_fields) => 
{

  const query_string = 
  `select user_id from tb_like_info 
  where quiz_id = $1 and user_id = $2`;

  return sendQuery(query_string, value_fields);

};

exports.updateQuizLikeCount = async (quiz_id) => 
{

  const query_string = 
  `UPDATE tb_quiz_info set like_count = (select count(user_id) from tb_like_info where tb_like_info.quiz_id = $1)
    where quiz_id = $1
    returning like_count;`;

  return sendQuery(query_string, [quiz_id]);

};

exports.certifyQuiz = async (quiz_id, played_count_criteria) => 
{

  const query_string = 
  `UPDATE tb_quiz_info set certified = true
    where quiz_id = $1 and (certified = false or certified is null) and played_count >= $2;`;

  return sendQuery(query_string, [quiz_id, played_count_criteria]);

};

exports.selectRandomQuestionListByTags = async (quiz_type_tags_value, tags_value, limit, certified_filter) => 
{

  const query_string =
  `
  WITH matching_quizzes AS (
    SELECT quiz_id, quiz_title, creator_name, creator_icon_url, simple_description, tags_value
    FROM tb_quiz_info
    WHERE (tags_value & $1) > 0
    and ($2 = 0 or (tags_value & $2) > 0)
    and is_private = false
    and is_use = true
    ${certified_filter ? 'and certified = true' : ''}
  )
  SELECT qu.*, mq.quiz_id, mq.quiz_title, mq.creator_name, mq.creator_icon_url, mq.simple_description, mq.tags_value,
    COUNT(*) OVER() AS total_count
  FROM tb_question_info qu
  JOIN matching_quizzes mq ON qu.quiz_id = mq.quiz_id
  WHERE qu.answer_type = 1 OR qu.answer_type IS NULL
  ORDER BY RANDOM()
  LIMIT $3;`;
  
  return sendQuery(query_string, [quiz_type_tags_value, tags_value, limit]);
};

exports.selectRandomQuestionListByBasket = async (basket_condition_query, limit) => 
{
  const query_string =
  `
  WITH matching_quizzes AS (
    SELECT quiz_id, quiz_title, creator_name, creator_icon_url, simple_description, tags_value
    FROM tb_quiz_info
    WHERE quiz_id IN ${basket_condition_query}
  )
  SELECT qu.*, mq.quiz_id, mq.quiz_title, mq.creator_name, mq.creator_icon_url, mq.simple_description, mq.tags_value,
    COUNT(*) OVER() AS total_count
  FROM tb_question_info qu
  JOIN matching_quizzes mq ON qu.quiz_id = mq.quiz_id
  WHERE qu.answer_type = 1 OR qu.answer_type IS NULL
  ORDER BY RANDOM()
  LIMIT $1;`;
  
  return sendQuery(query_string, [limit]);
};

//#region 신고 처리 관련

exports.insertChatInfo = async (key_fields, value_fields) =>
{
  const chat_id = 'chat_id';
  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }
  const query_string = 
  `
  INSERT INTO tb_chat_info (${key_fields})
  VALUES (${placeholders})
  ON CONFLICT (${chat_id}) DO NOTHING;
  `;
    
  return sendQuery(query_string, value_fields);
};

exports.insertReportInfo = async (key_fields, value_fields) =>
{
  let placeholders = '';
  for(let i = 1; i <= value_fields.length; ++i) 
  {
    placeholders += `$${i}` + (i == value_fields.length ? '' : ',');
  }

  const query_string = 
  `
  INSERT INTO tb_report_info (${key_fields})
  VALUES (${placeholders})
  `;
  
  return sendQuery(query_string, value_fields);
};

exports.selectReportChatInfo = async (limit) => 
{
  
  let query_string = 
    `select * 
      from tb_chat_info
      where result = 0
      limit $1`;
  
  return sendQuery(query_string, [limit]);
};

exports.selectReportLog = async (chat_id) => 
{
    
  let query_string = 
      `select * 
        from tb_report_info
        where target_id = $1`;
    
  return sendQuery(query_string, [chat_id]);
};

exports.selectBanHistory = async (user_id) => 
{
      
  let query_string = 
        `select * 
          from tb_ban_history
          where user_id = $1`;
      
  return sendQuery(query_string, [user_id]);
};

exports.updateBanHistory = async (user_id, ban_count, ban_expiration_timestamp) => 
{
  const query_string = 
    `
    INSERT INTO tb_ban_history (user_id, ban_count, ban_expiration_timestamp)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id)
    DO UPDATE SET 
        ban_count = EXCLUDED.ban_count,
        ban_expiration_timestamp = EXCLUDED.ban_expiration_timestamp;
    `;
    
  return sendQuery(query_string, [user_id, ban_count, ban_expiration_timestamp]);
};
  
exports.updateChatInfoResult = async (chat_id, result) => 
{
  const query_string = 
  `
  UPDATE tb_chat_info
  SET result = $2
  WHERE chat_id = $1;
  `;
        
  return sendQuery(query_string, [chat_id, result]);
};
  
exports.deleteReportedLog = async (target_id) => 
{
  const query_string = 
    `
    DELETE FROM tb_report_info
    WHERE target_id = $1
    RETURNING *;
    `;
            
  return sendQuery(query_string, [target_id]);
};
  

//#endregion

//#region 스코어보드 관련

exports.selectGlobalScoreboard = async (guild_id) =>
{
  const query_string = 
  `SELECT * 
    FROM tb_global_scoreboard
    WHERE guild_id = $1`;

  return sendQuery(query_string, [guild_id]);
};

exports.updateGlobalScoreboard = async (guild_id, win_add, lose_add, play_add, mmr_add, guild_name) =>  
{
  const query_string = 
  `
  INSERT INTO tb_global_scoreboard (guild_id, win, lose, play, mmr, guild_name)
  VALUES ($1, $2, $3, $4, GREATEST($5, 0), $6)
  ON CONFLICT (guild_id)
  DO UPDATE SET 
      win = tb_global_scoreboard.win + EXCLUDED.win,
      lose = tb_global_scoreboard.lose + EXCLUDED.lose,
      play = tb_global_scoreboard.play + EXCLUDED.play,
      mmr = GREATEST(tb_global_scoreboard.mmr + EXCLUDED.mmr, 0),
      guild_name = CASE WHEN EXCLUDED.guild_name <> '' THEN EXCLUDED.guild_name ELSE tb_global_scoreboard.guild_name END;

  `;
      
  return sendQuery(query_string, [guild_id, win_add, lose_add, play_add, mmr_add, guild_name]);
};

exports.selectTop10Scoreboard = async () =>
{
  const query_string =
  `
    SELECT * 
    FROM tb_global_scoreboard
    WHERE mmr != 0
    ORDER BY mmr DESC
    LIMIT 10;
  `;

  return sendQuery(query_string);

};
//#endregion