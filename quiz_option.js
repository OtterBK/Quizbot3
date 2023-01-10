
/** global 변수 **/
let option_storage_map = {}; //서버별 옵션 값

OPTION_TYPE = {
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
    }
}

//#region exports 정의

exports.OPTION_TYPE = OPTION_TYPE;

exports.getOptionStorage = (guild_id) => {
    let option_storage = option_storage_map[guild_id];
    if(option_storage == undefined)
    {
        option_storage = new OptionStorage(guild_id);
        option_storage_map[guild_id] = option_storage;
        option_storage.saveOptionToDB();
    }
    return option_storage;
}

exports.getOptionData = (guild_id) =>
{
    const option_storage = exports.getOptionStorage(guild_id);
    return option_storage.getOptionData();
}

exports.loadOptionData = async (guild_id) => {
    const option_storage = new OptionStorage(guild_id);
    option_storage.loadOptionFromDB()
    .then((is_load => {
        if(is_load == false)
        {
            return;
        }
        option_storage_map[guild_id] = option_storage;
    }));
}

//#endregion

//#region 옵션 관련
class OptionStorage
{
    constructor(guild_id)
    {
        this.option = {
            quiz: {
                audio_play_time: 30000,
                hint_type: OPTION_TYPE.HINT_TYPE.VOTE, 
                skip_type: OPTION_TYPE.SKIP_TYPE.VOTE,
                use_similar_answer: true,
                score_type: OPTION_TYPE.SCORE_TYPE.POINT,
                score_show_max: -1,
            }
        }
    }

    async loadOptionFromDB()
    {
        //TODO DB에서 옵션 로드하는 함수, 성공 시 TRUE 반환
        return false;
    }

    async saveOptionToDB()
    {
        //TODO DB에 저장하는 함수, 성공 시 TRUE 반환
        return new Promise((resolve, reject) => {
            resolve(false);
        })
    }

    getOptionData()
    {
        return this.option;
    }
}
//#endregion