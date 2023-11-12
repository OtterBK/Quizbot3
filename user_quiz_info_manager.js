//외부 modules


//로컬 modules
const db_manager = require('./db_manager.js');
const logger = require('./logger.js')('UserQuizInfoManager');

const QuizInfoColumn = 
[
    "creator_id",
    "creator_name",
    "creator_icon_url",
    "quiz_title",
    "thumbnail",
    "simple_description",
    "description",
    "winner_nickname",
    "birthtime",
    "modified_time",
    "played_count",
    "is_private",
];

let quiz_info_key_fields = '';
QuizInfoColumn.forEach((field) =>
{
    if(quiz_info_key_fields != '')
    {
        quiz_info_key_fields += ', ';
    }
    quiz_info_key_fields += `${field}`;
});


class UserQuizInfo //유저 제작 퀴즈 정보
{
    constructor()
    {
      this.data = {};

      for(const column of QuizInfoColumn)
      {
        this.data[column] = undefined;
      }

      this.quiz_id = undefined;

      //DB 추가 로드해야지만 알 수 있는 정보
      this.question_list = []; //UserQuestionInfo 타입
    }

    async saveDataToDB(is_update=true)
    {
      let quiz_info_value_fields = Object.values(this.data);

      let result = undefined;
      //quiz info DB에 저장
      if(is_update == false)
      {
        result = await db_manager.insertQuizInfo(quiz_info_key_fields, quiz_info_value_fields);
      }
      else
      {
        result = await db_manager.updateQuizInfo(quiz_info_key_fields, quiz_info_value_fields)
      }

      if(result != undefined && result.rows.length != 0)
      {
        this.quiz_id = result.rows[0].quiz_id;
        return this.quiz_id;
      }

      return undefined;
    }

    async delete()
    {
      db_manager.disableQuizInfo(this.quiz_id);
    }

    async loadQuestionListFromDB()
    {
      console.log("do load question list from db");
    }

    async saveQuestionToDB()
    {
      //quiz question 전체 db에 저장
      for(const question of question_list)
      {
        question.saveDataToDB();
      }
    }
}

class UserQuestionInfo //유저 제작 문제 정보
{
  constructor()
  {
    this.quiz_id == undefined;

    this.data = 
    {
      question_id : undefined,
      question_audio_url : undefined,
      answers : undefined,
      hint : undefined,
      audio_start : undefined,
      audio_end : undefined,
      audio_play_time : undefined,
      question_image_url : undefined,
      question_text : undefined,
      answer_audio_url : undefined,
      answer_image_url : undefined,
      answer_text : undefined,
    }

  }

  async saveDataToDB()
  {

  }
}

const loadUserQuizListFromDB = async (creator_id) => {

    let user_quiz_list = [];

    const result = await db_manager.selectQuizInfo(QuizInfoColumn, [creator_id]);

    for(const result_row of result.rows)
    {
        let user_quiz_info = new UserQuizInfo();

        user_quiz_info.quiz_id = result_row.quiz_id;

        if(user_quiz_info.quiz_id == undefined) // quiz id는 없을 수 없다.
        {
            logger.error(`User Quiz Info ID is undefined... pass this`);
            continue;
        }

        for(const column of QuizInfoColumn)
        {
          user_quiz_info.data[column] = result_row[column];
        }

        user_quiz_list.push(user_quiz_info);
    }

    return user_quiz_list;
}

module.exports = { UserQuizInfo, UserQuestionInfo, loadUserQuizListFromDB, QuizInfoColumn };