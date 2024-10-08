'use strict';

//외부 modules


//로컬 modules
const db_manager = require('../managers/db_manager.js');
const logger = require('../../utility/logger.js')('OptionManager');

/** global 변수 **/
let option_storage_map = {}; //서버별 옵션 값

const OPTION_TYPE = {
  HINT_TYPE: {
    AUTO: "자동",
    VOTE: "투표",
    OWNER: "주최자",
  },
  SKIP_TYPE: {
    VOTE: "투표",
    OWNER: "주최자",
  },
  SCORE_TYPE: {
    TIME: "남은 시간 비례",
    POINT: "고정 점수"
  },
  ENABLED: 'true',
  DISABLED: 'false',
  UNLIMITED: -1,
};

//#region exports 정의

exports.OPTION_TYPE = OPTION_TYPE;

exports.getOptionStorage = (guild_id) => 
{
  let option_storage = option_storage_map[guild_id];
  if(option_storage == undefined)
  {
    option_storage = new OptionStorage(guild_id);
    option_storage_map[guild_id] = option_storage;
    option_storage.saveOptionToDB();
  }
  return option_storage;
};

exports.getOptionData = (guild_id) =>
{
  const option_storage = exports.getOptionStorage(guild_id);
  return option_storage.getOptionData();
};

exports.loadOptionData = async (guild_id) => 
{
  const option_storage = new OptionStorage(guild_id);
  option_storage.loadOptionFromDB()
    .then((is_load => 
    {
      if(is_load == false)
      {
        return;
      }
      option_storage_map[guild_id] = option_storage;
    }));
};

//#endregion

//#region 옵션 관련
class OptionStorage
{
  constructor(guild_id)
  {
    this.guild_id = guild_id;

    this.option = {
      quiz: {
        audio_play_time: 30000,
        hint_type: OPTION_TYPE.HINT_TYPE.VOTE, 
        skip_type: OPTION_TYPE.SKIP_TYPE.VOTE,
        use_similar_answer: OPTION_TYPE.ENABLED,
        score_type: OPTION_TYPE.SCORE_TYPE.POINT,
        improved_audio_cut: OPTION_TYPE.ENABLED,
        use_message_intent: OPTION_TYPE.ENABLED,
        score_show_max: OPTION_TYPE.UNLIMITED,
        max_chance: OPTION_TYPE.UNLIMITED,
      }
    };
  }

  async loadOptionFromDB()
  {
    let option_fields = '';
    Object.keys(this.option.quiz).forEach((field) =>
    {
      if(option_fields != '')
      {
        option_fields += ', ';
      }
      option_fields += `${field}`;
    });

    const result = await db_manager.selectOption(this.guild_id, option_fields);

    if(result == undefined || result.rowCount == 0)
    {
      return false;
    }

    const result_row = result.rows[0];

    let option_data = {};
    Object.keys(result_row).forEach((key) => 
    {
      const value = result_row[key];
      option_data[key] = typeof value == 'string' ? value.trim() : value;
    });
    this.option.quiz = option_data;

    return true;
  }

  async saveOptionToDB()
  {
    let option_fields = '';
    let option_values = '';
    Object.keys(this.option.quiz).forEach((field) =>
    {
      if(option_fields != '')
      {
        option_fields += ', ';
      }
      option_fields += `${field}`;
    });

    Object.values(this.option.quiz).forEach((value) =>
    {
      if(option_values != '')
      {
        option_values += ', ';
      }
      option_values += `'${`${value}`.trim()}'`;
    });

    return db_manager.updateOption(this.guild_id, option_fields, option_values);
  }

  getOptionData()
  {
    return this.option;
  }
}
//#endregion