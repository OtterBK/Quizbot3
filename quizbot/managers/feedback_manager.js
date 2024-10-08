//외부모듈
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

//로컬 모듈
const db_manager = require('./db_manager.js');
const {  SYSTEM_CONFIG, CUSTOM_EVENT_TYPE } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('FeedbackManager');

const LikeInfoColumn = 
[
  "quiz_id",
  "guild_id",
  "user_id",
];

let like_info_key_fields = '';
LikeInfoColumn.forEach((field) =>
{
  if(like_info_key_fields != '')
  {
    like_info_key_fields += ', ';
  }
  like_info_key_fields += `${field}`;
});

//@Deprecated
const feedback_quiz_info_map = {}; //dynamic quiz feedback을 위해 사용

//퀴즈 피드백 Component
exports.quiz_feedback_comp = new ActionRowBuilder()
  .addComponents(
    new ButtonBuilder()
      .setCustomId('like')
      .setLabel('추천하기')
      .setStyle(ButtonStyle.Primary)
      .setEmoji("👍"),
  );

//@Deprecated
//퀴즈 id별 custom_id 설정한 comp 생성
exports.createDynamicQuizFeedbackComponent = (guild_id, quiz_id, quiz_title, creator_name) => 
{
  feedback_quiz_info_map[guild_id] = {quiz_id: quiz_id, quiz_title: quiz_title, creator_name: creator_name};

  return exports.quiz_feedback_comp;
};

exports.addQuizLikeAuto = async (interaction, quiz_id, quiz_title) =>
{ 
  const guild = interaction.guild;
  const user = interaction.user;
  const guild_id = guild.id;
  const user_id = user.id;

  if(await exports.checkAlreadyLike(quiz_id, user_id))
  {
    interaction.reply({content: '```' + `💚 이미 [${quiz_title}] 퀴즈를 추천했네요. 감사합니다! 😄` + '```', ephemeral: true});
    interaction.explicit_replied = true;
    return;
  }

  exports.addQuizLike(quiz_id, guild_id, user_id)
    .then((result) => 
    {

      if(result == true)
      {
        interaction.explicit_replied = true;
        interaction.reply({content: '```' + `👍 [${quiz_title}] 퀴즈를 추천했어요! ` + '```', ephemeral: true});
        logger.info(`Custom quiz got liked by ${user.displayName}[${user_id}]. quiz_title: ${quiz_title} quiz_id: ${quiz_id}`);
      }
      else
      {
        interaction.explicit_replied = true;
        interaction.reply({content: '```' + `💚 이미 [${quiz_title}] 퀴즈를 추천했네요. 감사합니다! 😄` + '```', ephemeral: true});
      }
    });
};

exports.addQuizLike = async (quiz_id, guild_id, user_id) =>
{
  if(quiz_id == undefined || guild_id == undefined || user_id == undefined)
  {
    return false;
  }

  const result = await db_manager.insertLikeInfo(like_info_key_fields, [quiz_id, guild_id, user_id]);

  if(result == undefined || result.rowCount == 0) //maybe already exists
  {
    return false;
  }

  db_manager.updateQuizLikeCount(quiz_id)
    .then((like_count_result) => 
    {
    
      const like_count = like_count_result.rows[0].like_count;

      logger.info(`Custom quiz's like updated to ${like_count}. quiz_id: ${quiz_id}`);
      if(like_count >= SYSTEM_CONFIG.certify_like_criteria) //특정 수 이상이면 인증된 퀴즈 시도
      {
        logger.debug(`Trying Custom quiz has been auto certified. quiz_id: ${quiz_id}`);
        db_manager.certifyQuiz(quiz_id, SYSTEM_CONFIG.certify_played_count_criteria);
      }
    });

  return true;
};

exports.checkAlreadyLike = async (quiz_id, user_id) =>
{
  if(quiz_id == undefined || user_id == undefined)
  {
    return false;
  }

  const result = await db_manager.selectLikeInfo([quiz_id, user_id]);

  if(result == undefined || result.rows?.length == 0) //not exists
  {
    return false;
  }

  return true; //exists
};

exports.do_event = (event_name, interaction) =>
{
  if(interaction.custom_id != 'like')
  {
    return false;
  }

  const guild_id = interaction.guild.id;
  if(feedback_quiz_info_map.hasOwnProperty(guild_id) == false)
  {
    return false;
  }

  if(event_name != CUSTOM_EVENT_TYPE.interactionCreate)
  {
    return false;
  }

  const target_quiz = feedback_quiz_info_map[guild_id];

  exports.addQuizLikeAuto(guild_id, interaction.member, target_quiz.quiz_id, target_quiz.quiz_title);

  return true;
};