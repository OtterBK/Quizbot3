//외부 modules
const fs = require('fs');

//로컬 modules
const QUIZ_TYPE = require('./QUIZ_TYPE.json');
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

exports.fade_audio_play = (audio_player, audio_resource, from, to, duration) =>
{
  const interval = 100; //ms단위

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
        audio_player.play(audio_resource);
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
}