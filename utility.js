//외부 modules
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration')
const { createAudioResource, StreamType } = require('@discordjs/voice');
const ffprobe = require('node-ffprobe'); //원래라면 module.exports.sync 를 true 셋해서 불러와야 doProbeSync로 가져오는데... 그냥 모듈 수정해서 하드코딩으로 가져오게함

//로컬 modules
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, BGM_TYPE } = require('./system_setting.js');
const text_contents = require('./text_contents.json')["kor"]; //한국어로 가져와서 사용

exports.loadLocalDirectoryQuiz = (contents_path) =>
{
  let content_list = fs.readdirSync(contents_path);

  let quiz_contents = [];
  content_list.forEach(content_name => {

    let quiz_content = this.parseContentInfoFromDirName(content_name);

    // 하위 컨텐츠 있으면 추가 파싱 진행
    const content_path = `${contents_path}/${content_name}`;
    quiz_content['content_path'] = content_path;

    const is_quiz = quiz_content['is_quiz'];

    if(is_quiz == false)
    {
      const stat = fs.lstatSync(content_path);
      if(!stat.isFile()) //퀴즈가 아닌데 폴더 타입이면 하위 디렉터리 읽어옴
      {
        quiz_content['sub_contents'] = this.loadLocalDirectoryQuiz(content_path);
      }
    }
    else
    {
      //퀴즈면 info.txt 읽어옴
      const quiz_file_list = fs.readdirSync(content_path);

      let quiz_size = 0;
      let description = '';
      quiz_file_list.forEach(quiz_file_name => {

        if(quiz_file_name.includes("info.txt") == false)
        {
          quiz_size += 1;
          return;
        }

        //info.txt를 찾았다... 이제 이걸 파싱... 난 왜 이런 방식을 사용했던걸까..?
        const info_txt_path = `${content_path}/${quiz_file_name}`;
        const info_data = fs.readFileSync(info_txt_path, 'utf8');

        info_data.split('\n').forEach((line) => {
          if(line.startsWith('&topNickname: ')) //1등 별명
          {
            quiz_content['winner_nickname'] = line.replace('&topNickname: ', "").trim();
            return;
          }

          if(line.startsWith('&typeName: '))
          {
            quiz_content['type_name'] = line.replace('&typeName: ', "").trim();
            return;
          }

          if(line.startsWith("&repeatCnt: ")) //반복 횟수, 우선 이전 코드에 있으니 구현은 해놓는데 실제로 쓰는지는 애매함
          {
            quiz_content['repeat_count'] = line.replace("&repeatCnt: ", "").trim();
            return;
          }

          if(line.startsWith("&quizCount: ")) //퀴즈 수, 우선 이전 코드에 있으니 구현은 해놓는데 실제로 쓰는지는 애매함
          {
            quiz_content['quiz_size'] = line.replace("&quizCount: ", "").trim();
            return;
          }
          
          description += line + "\n"; //그 외에는 다 설명으로
        }) //한 줄씩 일어오자
      });

      // 퀴즈 수
      if(quiz_content['quiz_size'] == undefined) 
        quiz_content['quiz_size'] = quiz_size;

      // Description
      quiz_content['description'] = description;

      //아이콘으로 퀴즈 타입 가져오기... icon 방식을 채택한 예전 자신을 원망하자
      const quiz_icon = quiz_content['icon'];

      quiz_content['quiz_type'] = this.getQuizTypeFromIcon(quiz_icon);

    }

    quiz_contents.push(quiz_content);

  })
  
  return quiz_contents;
}

exports.getQuizTypeFromIcon = (quiz_icon) => {
    if(quiz_icon == text_contents.icon.ICON_TYPE_SONG)
        return QUIZ_TYPE.SONG

    if(quiz_icon == text_contents.icon.ICON_TYPE_PICTURE)
        return QUIZ_TYPE.PICTURE

    if(quiz_icon == text_contents.icon.ICON_TYPE_PICTURE_LONG)
        return QUIZ_TYPE.PICTURE_LONG

    if(quiz_icon == text_contents.icon.ICON_TYPE_OX)
        return QUIZ_TYPE.OX

    if(quiz_icon == text_contents.icon.ICON_TYPE_INTRO)
        return QUIZ_TYPE.INTRO

    if(quiz_icon == text_contents.icon.ICON_TYPE_QNA)
        return QUIZ_TYPE.QNA

    if(quiz_icon == text_contents.icon.ICON_TYPE_SCRIPT)
        return QUIZ_TYPE.SCRIPT

    if(quiz_icon == text_contents.icon.ICON_TYPE_SELECT)
        return QUIZ_TYPE.SELECT

    if(quiz_icon == text_contents.icon.ICON_TYPE_MULTIPLAY)
        return QUIZ_TYPE.MULTIPLAY

    return QUIZ_TYPE.SONG //결국 기본타입은 SONG
}

exports.parseContentInfoFromDirName = (dir_name) =>
{
  let content = {};

  content['name'] = dir_name.split("&")[0];

  let icon = dir_name.split("icon="); //ICON 만 파싱
  if(icon.length > 1) //icon= 이 있다면
    content['icon'] = icon[1].split("&")[0];
  else 
  {
    content['icon'] = text_contents.icon.ICON_QUIZ_DEFAULT;
  }

  const is_quiz = dir_name.includes("&quiz") ? true : false;
  content['is_quiz'] = is_quiz;

  content['sub_contents'] = undefined;

  return content;
}

exports.fade_audio_play = async (audio_player, audio_resource, from, to, duration) =>
{
  const interval = SYSTEM_CONFIG.fade_interval; //ms단위

  let current_time = 0;
  let current_volume = from;

  let gap = to - from; //0 < ? fade_out, 0 > ? fade_in

  const is_fade_in = gap >= 0 ? true : false;
  const change_per = gap / (duration / interval);

  if(is_fade_in == true)
  {
    audio_resource.volume.setVolume(current_volume);
    audio_player.play(audio_resource);
  }

  const timer_id = setInterval(() => {

    if(current_time >= duration)
    {
      if(is_fade_in == false)
      {
        // audio_player.stop();
      }
      clearInterval(timer_id);
      console.log("finished fade " + (is_fade_in ? "in" : "out"));
      return;
    }

    current_time += interval;

    if(current_volume != to)
    {
      current_volume += change_per;

      if(current_volume < 0) current_volume = 0;
  
      if(is_fade_in == true && current_volume > to) current_volume = to;
      if(is_fade_in == false && current_volume < to) current_volume = to;

      audio_resource.volume.setVolume(current_volume);
    }
  
  }, interval);

  return timer_id;
}

exports.getAudioLength = async (audio_file_path) => 
{
  //filepath 말고 stream 으로 알아내는 방법이 있는데,
  //해당 모듈에서 계속 No Duration Found 문제가 발생한다.
  //filepath 로 duration 가져오는데 보통 100ms 걸린다
  return await getAudioDurationInSeconds(audio_file_path);
}

exports.getBlobLength = () => 
{
  // https://www.npmjs.com/package/get-blob-duration
  // https://www.npmjs.com/package/ffprobe-duration
}

exports.getAudioInfo = async (file_path) => 
{
  return ffprobe(file_path);
}

exports.getRandom = (min, max) => 
{
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Deprecated
exports.getSizeOfMetadata = (file_type) => 
{
  //그냥 꼼수로 가져오자... byte 단위다
  switch(file_type)
  {
    case "mp3":
      return 12288; //AI가 10kb ~ 12kb 정도라 했음
    case "ogg":
      return 144; //보통 142
    case "wav":
      return 44; //44고정
    
    default: return undefined;
  }
}

exports.sleep = (duration) => 
{
  return new Promise((resolve, reject) =>
  {
      setTimeout(() => { resolve(); }, duration);
  });
}

exports.sortDictByValue = (dict_obj) => {
  const sorted_array = Object.keys(dict_obj).map(k => ([k, dict_obj[k]])).sort((a, b) => (b[1] - a[1]));
  let sorted_dict = {};
  sorted_array.forEach(iter => {
    sorted_dict[iter[0]] = iter[1];
  });

  return sorted_dict;
}

exports.sortMapByValue = (map_obj) => {
  return new Map([...map_obj.entries()].sort((a, b) => b[1] - a[1]));
}

exports.playBGM = async (audio_player, bgm_type) => {

  if(audio_player == undefined) return;

  const bgm_file_path = SYSTEM_CONFIG.bgm_path + bgm_type;

  const bgm_resource = createAudioResource(bgm_file_path, {
    inputType: StreamType.WebmOpus,
    inlineVolume: false,
  });
  audio_player.play(bgm_resource);
}

