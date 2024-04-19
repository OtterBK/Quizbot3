const { addQuizLike, checkQuizLike } = require('./user_quiz_info_manager.js');
const {  CUSTOM_EVENT_TYPE } = require('../../config/system_setting.js');
const { intersection } = require('lodash');

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
)

//@Deprecated
//퀴즈 id별 custom_id 설정한 comp 생성
exports.createDynamicQuizFeedbackComponent = (guild_id, quiz_id, quiz_title, creator_name) => 
{
    feedback_quiz_info_map[guild_id] = {quiz_id: quiz_id, quiz_title: quiz_title, creator_name: creator_name};

    return quiz_feedback_comp;
}

exports.addLikeAuto(guild, user, quiz_id, quiz_title, creator_name, channel)
{
  addQuizLike(quiz_id, guild.id, user.id)
  .then((result) => {

    if(result == true)
    {
      channel.send({content: `>>>❤ **${user.displayName}**님이 **[${quiz_title}/${creator_name}]** 퀴즈를 추천하였습니다!`});
    }
    else
    {
      channel.send({content: `>>>💚 **${guild.name}**서버는 이미 **[${quiz_title}/${creator_name}]** 퀴즈를 추천하였습니다.`});
    }
  });
}

exports.checkAlreadyLike = (quiz_id, guild_id) =>
{
    return checkQuizLike(quiz_id, guild_id);
}

exports.do_event(event_name, interaction)
{
  if(intersection.custom_id != 'like')
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

  exports.addLikeAuto(guild_id, interaction.member, target_quiz.quiz_id, target_quiz.quiz_title, target_quiz.creator_name, intersection.channel);

  return true;
}