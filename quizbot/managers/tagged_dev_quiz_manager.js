//오마카세 퀴즈에서 Dev 퀴즈 사용을 위해 만든 모듈
//외부 modules
const fs = require('fs');
const path = require('path');

//로컬 modules
const logger = require('../../utility/logger.js')('DevQuizTagManager');
const { DEV_QUIZ_TAG, SYSTEM_CONFIG } = require('../../config/system_setting.js');
const utility = require('../../utility/utility.js');


let tagged_question_map;

exports.initialize = (tagged_quiz_info_path) => 
{
  const tagged_quiz_info = fs.readFileSync(tagged_quiz_info_path, 'utf-8');
  const data = JSON.parse(tagged_quiz_info);

  tagged_question_map = new Map();

  for (const tag_name in data) 
  {
    const quiz_path_list = data[tag_name];
        
    const question_list = [];
        
    quiz_path_list.forEach(content_path => 
    {
      const content_names = content_path.split('/');
      const content_name = content_names.length > 1 ? content_names[1] : content_names[0];
      const quiz_info = utility.parseContentInfoFromDirName(content_name);

      const quiz_path = SYSTEM_CONFIG.dev_quiz_path + "/" + content_path + "/";
      const quiz_title = `${quiz_info['name']} `;

      if (fs.existsSync(quiz_path) && fs.lstatSync(quiz_path).isDirectory()) 
      {
        const current_question_list = fs.readdirSync(quiz_path, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => 
          {
            const question = {};

            question['quiz_path'] = quiz_path;
            question['path'] = dirent.name;
            question['title'] = quiz_title;
            question['tag'] = tag_name;

            return question;
                        
          }); // 절대 경로로 변환
        question_list.push(...current_question_list);
      }         
    });

    const tag_value = DEV_QUIZ_TAG[tag_name];
    tagged_question_map.set(tag_value, question_list);

    logger.info(`Loaded Tagged Question. Tag Name: ${tag_name}, Amount: ${question_list.length}`);
  }

  return tagged_question_map;
};

exports.getQuestionListByTags = (tags_value, limit=0) => //0 == unlimited
{
  if(tags_value == 0)
  {
    return [0, []];
  }

  const total_question_list = [];

  for(let [tag_value, question_list] of tagged_question_map)
  {
    if((tags_value & tag_value) === tag_value)
    {
      total_question_list.push(...question_list);
    }
  }

  total_question_list.sort(() => Math.random() - 0.5);

  if(limit <= 0)
  {
    return total_question_list;
  }

  const total_question_count = total_question_list.length;
  //limit만큼만 반환
  return [total_question_count, total_question_list.slice(0, limit)];
};

exports.getQuestionAmountByTags = (tags_value) => 
{
  let total_question_count = 0;

  for(let [tag_value, question_list] of tagged_question_map)
  {
    if((tags_value & tag_value) === tag_value)
    {
      total_question_count += question_list.length;
    }
  }

  return total_question_count;
};