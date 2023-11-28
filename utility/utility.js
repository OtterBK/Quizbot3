//외부 modules
const fs = require('fs');
const { EmbedBuilder } = require('discord.js');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const mm = require('music-metadata');

//로컬 modules
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, BGM_TYPE } = require('../config/system_setting.js');
const { orderBy } = require('lodash');
const text_contents = require('../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const logger = require('./logger.js')('Utility');

//미리 로드해둘 것들
let bgm_long_timers = undefined;
exports.initializeBGM = () =>
{
  const long_timer_path = SYSTEM_CONFIG.bgm_path + "/" + BGM_TYPE.COUNTDOWN_LONG;
  bgm_long_timers = [];
  long_timer_list = fs.readdirSync(long_timer_path);
  long_timer_list.forEach((file_name) => {
    bgm_long_timers.push(long_timer_path + "/" + file_name)
  });
}

exports.loadLocalDirectoryQuiz = (contents_path, orderby='none') =>
{
  logger.info(`Loading local directory quiz... ${contents_path}`);
  
  let content_list = fs.readdirSync(contents_path);

  let quiz_contents = [];
  content_list.forEach(content_name => {

    const content_path = `${contents_path}/${content_name}`;

    const stat = fs.lstatSync(content_path);
    if(stat.isDirectory() == false) return; //폴더만 load함

    let quiz_content = this.parseContentInfoFromDirName(content_name);
    quiz_content['content_path'] = content_path;
    quiz_content['mtime'] = 0;

    // 하위 컨텐츠 있으면 추가 파싱 진행
    const is_quiz = quiz_content['is_quiz'];

    if(is_quiz == false)
    {
      if(!stat.isFile()) //퀴즈가 아닌데 폴더 타입이면 하위 디렉터리 읽어옴
      {
        const sub_contents = this.loadLocalDirectoryQuiz(content_path, orderby);
        quiz_content['sub_contents'] = sub_contents;
        let latest_mtime = 0;
        sub_contents.forEach(sub_content => {
          if((sub_content.mtime?? 0) > latest_mtime)
            latest_mtime = sub_content.mtime?? 0;
        });
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

          if(line.startsWith("&createDate: ")) //명시적 퀴즈 생성일
          {
            const date_string = line.replace("&createDate: ", "").trim();
            quiz_content['mtime'] = new Date(date_string).getTime();
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

  //정렬해서 넘겨준다.
  if(orderby === 'mtime')
  {
    //파일 생성일로 정렬
    const ordered_quiz_contents = quiz_contents
        .sort(function(a, b) { return b.mtime - a.mtime; });

    return ordered_quiz_contents;
  }
  
  return quiz_contents;
}

exports.getQuizTypeFromIcon = (quiz_icon) => {
    if(quiz_icon == text_contents.icon.ICON_TYPE_SONG)
        return QUIZ_TYPE.SONG

    if(quiz_icon == text_contents.icon.ICON_TYPE_IMAGE)
        return QUIZ_TYPE.IMAGE

    if(quiz_icon == text_contents.icon.ICON_TYPE_IMAGE_LONG)
        return QUIZ_TYPE.IMAGE_LONG

    if(quiz_icon == text_contents.icon.ICON_TYPE_OX)
        return QUIZ_TYPE.OX

    if(quiz_icon == text_contents.icon.ICON_TYPE_INTRO)
        return QUIZ_TYPE.INTRO

    if(quiz_icon == text_contents.icon.ICON_TYPE_TEXT)
        return QUIZ_TYPE.TEXT

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

  if(is_fade_in == true)
  {
    audio_player.play(audio_resource);
    if(audio_resource == undefined || audio_resource.volume == undefined) return;
    audio_resource.volume.setVolume(current_volume);
  }

  const change_per = gap / (duration / interval);
  const timer_id = setInterval(() => {

    if(audio_resource == undefined || audio_resource.volume == undefined) //가드 코드
    {
      clearInterval(timer_id);
    }

    if(current_time >= duration)
    {
      if(is_fade_in == false && audio_resource.volume.volume == 0)
      {
        audio_player.stop();
      }
      clearInterval(timer_id);
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

exports.getBlobLength = () => 
{
  // https://www.npmjs.com/package/get-blob-duration
  // https://www.npmjs.com/package/ffprobe-duration
}

exports.getAudioInfoFromPath = async (file_path) => 
{
  return await mm.parseFile(file_path, { skipCovers: true, skipPostHeaders: true });
}

exports.getAudioInfoFromStream = async (stream) => 
{
  return await mm.parseStream(stream, { skipCovers: true, skipPostHeaders: true });
}

exports.getAudioInfoFromBuffer = async (buffer) => 
{
  return await mm.parseBuffer(buffer, { skipCovers: true, skipPostHeaders: true });
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

  let bgm_file_path = undefined;
  if(bgm_type == BGM_TYPE.COUNTDOWN_LONG)
  {
    if(bgm_long_timers == undefined || bgm_long_timers.length == 0){
      logger.error("BGM long timer list is empty, check long timer path or InitializeBGM() function has been called");
      return undefined;
    }
    const rd = exports.getRandom(0, bgm_long_timers.length)
    bgm_file_path = bgm_long_timers[rd];
  }
  else
  {
    bgm_file_path = SYSTEM_CONFIG.bgm_path + "/" + bgm_type
  }

  if(bgm_file_path == undefined) return;

  const bgm_file_stream = fs.createReadStream(bgm_file_path, {flags:'r'});

  //23.01.23 use_inline_volume 옵션을 끄니, bgm이 안나오는 버그가 있었다.
  //도저히 왜 그런지는 모르겠으나, file 경로를 createAudioResource로 넘기지 않고, 
  //stream을 만들어 넘기고, bgm 유형을 mp3에서 opus로 변경하니 해결됐다.
  //버그 맞다. 로컬 파일 재싱 시에는 항상 스트림을 만들어서 넘겨라 https://github.com/discordjs/discord.js/issues/7232

  let inputType = StreamType.WebmOpus;
  if(bgm_file_path.endsWith(".opus")) inputType = StreamType.OggOpus;
  if(bgm_file_path.endsWith(".mp3")) inputType = StreamType.Arbitrary;

  const bgm_resource = createAudioResource(bgm_file_stream, {
    inputType:  inputType,
    inlineVolume: false,
  });
  audio_player.play(bgm_resource);

  return bgm_resource;
}

exports.isImageFile = (file_name) => { //그냥 확장자로 확인해도 된다.
  if(file_name.endsWith(".png") || file_name.endsWith(".jpg") || file_name.endsWith(".gif") || file_name.endsWith(".PNG") || file_name.endsWith(".webp"))
  {
    return true;
  }
  return false;
}

exports.isValidURL = (url) => 
{
  try
  {
    if(url == undefined || url.length == 0 || url.endsWith(".webp") == true || (url.startsWith("http://") == false && url.startsWith("https://") == false) || url.includes(".") == false) //webp는 사용 불가
    {
      return false;
    }

    const test_url = new URL(url);
    return true;
  }
  catch(err)
  {
    return false;
  }
}
