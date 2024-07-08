/** @distube/ytdl-core 에만 있는 agent 기능, 다만 이 ytdl-core는 HTTP 통신 모듈로 기존 ytdl-core와는 다른걸 사용한다.(쿠키 지원을 위해서 인듯. 이름은 기억 안남) 
 * 여기까지는 괜찮다...다만 requestOptions로 ipv6 주소를 localAddress에 넣고 family 값도 6으로 넘겨야 잘 인식하는데
 * 기존 ytdl-core은 이렇게하면 잘 되는데 @distube/ytdl-core는 family 값 지정 기능이 없다...
 * 따라서 유일하게 지원하는 autoSelectFamily를 true로 넘겨야하는데, 이 기능은 nodejs 18부터 지원한다...! 흑흑
 * 우선 어거지로 16 -> 18로 업데이트했는데 큰 문제는 없이 동작한다.
 * 만약 EINVAL(errno -22)에러가 뜨면 IPv6 주소를 IPv4로 파싱하려고 하다 문제가 생긴거니, family 값을 잘 명시해줘야하며
 * 만약 -99에러가 뜨면 정말 해당 ip로 외부 통신이 불가능한것이라 발생한다.(localAddress에 IP주소 잘 넣었는지 확인필요)
 * 
 * 24.02.02 정말 @distube/ytdl-core만을 사용해야하는지 의문이 든다.
 * 유일한 문제점은 해당 모듈이 HTTP 통신 모듈로 undici를 사용하는데, 이 경우 localAddress 옵션이 잘 먹지 않고 bind -22 에러가 난다는 문제다...
 * 또한 해당 모듈로 바꾼 뒤부터 connReset 에러가 난다... -> 24.02.08 해당 모듈 문제는 아니었다...nodejs 18로 바꾼게 문제일 수 있으니 16으로 롤백해보기로한다.(ytdl-core 자체의 문제일 수 있다.)
 * 정말 필요한지 한번 다시 고려해보기로 하고 ytdl-core로 롤백하기로 결정하였다.
*/

//Deprecated
// function createYtdlAgent(quiz_session=undefined)
// {
//     let cookie = undefined;
//     let local_address = undefined;
//     let auto_select_family = false;

//     if(SYSTEM_CONFIG.ytdl_cookie_agent_use)
//     {
//         try
//         {
//             const ytdl_cookie_path = SYSTEM_CONFIG.ytdl_cookie_path;
//             if(ytdl_cookie_path == undefined || fs.existsSync(ytdl_cookie_path) == false)
//             {
//                 logger.error(`Failed to create cookie ytdl agent cookie  ${'YTDL Cookie'} ${ytdl_cookie_path} is not exists`);
//                 return false;
//             }

//             cookie = JSON.parse(fs.readFileSync(ytdl_cookie_path));

//             logger.info(`This session is using cookie ytdl agent, cookie file is ${ytdl_cookie_path}, guild_id:${quiz_session?.guild_id}`);
//         }
//         catch(err)
//         {
//             logger.info(`Failed to create cookie ytdl agent cookie path: ${ytdl_cookie_path}, guild_id:${quiz_session?.guild_id}, err: ${err.stack ?? err.message}`);
//         }
//     }

//     if(SYSTEM_CONFIG.ytdl_ipv6_USE)
//     {
//         const ipv6 = utility.getIPv6Address()[0];
//         if(ipv6 == undefined)
//         {
//             logger.info(`This session is using ipv6 for agent, but cannot find ipv6... use default ip address..., guild_id:${quiz_session?.guild_id}`);
//         }
//         else
//         {
//             logger.info(`This session is using ipv6 for agent, selected ipv6 is ${ipv6}, guild_id:${quiz_session?.guild_id}`);
//             local_address = ipv6;
//             auto_select_family = true;
//         }
//     }

//     const ytdl_agent = ytdl.createAgent(
//         cookie,
//         {
//             autoSelectFamily: auto_select_family,
//             localAddress: local_address
//         }
//     ); //cookie 기반 ytdl agent

//     return ytdl_agent;
// }


/** audio_url_row: 오디오 url, audio_start_row: 오디오 시작 지점(sec), audio_end_row: 오디오 끝 지점(sec), audio_play_time_row: 재생 시간(sec)*/
//Deprecated
// async getAudioStreamResourceFromWeb(audio_url_row, audio_play_time_row=undefined, audio_start_row=undefined, audio_end_row=undefined, type='question', ip_info=[]) 
// {
//     let error_message;

//     if(ytdl.validateURL(audio_url_row) == false)
//     {
//         logger.warn(`${audio_url_row} is not validateURL`);
//         error_message = `${audio_url_row} is not validateURL`;
//         return [undefined, undefined, error_message];
//     }

//     const option_data = this.quiz_session.option_data;

//     const max_play_time_sec = (type == 'question' ? SYSTEM_CONFIG.max_question_audio_play_time : SYSTEM_CONFIG.max_answer_audio_play_time); //question->60s, answer->12s

//     let audio_resource; //최종 audio_resource
//     let audio_length_ms; //최종 audio_length

//     //오디오 정보 가져오기
//     const [ipv4, ipv6] = ip_info;

//     const try_info_list = [];
//     if(ipv6 != undefined) //처음엔 ipv6로 시도
//     {
//         try_info_list.push([ipv6, 6]);
//     }

//     if(ipv4 != undefined) //그 다음엔 ipv4로 시도
//     {
//         try_info_list.push([ipv4, 4]);
//     }

//     if(try_info_list.length == 0)
//     {
//         try_info_list.push([undefined, undefined]); //뭐가 없으면 그냥 해보기
//     }
//     logger.debug(`ytdl get info scenario is ${try_info_list.length}`);

//     let youtube_info = undefined;
//     let available_address;
//     let available_family;

//     for(let i = 0; i < try_info_list.length; ++i)
//     {
//         const [ip, family] = try_info_list[i];

//         try
//         {
//             if(ip == undefined || family == undefined)
//             {
//                 youtube_info = await ytdl.getInfo(audio_url_row);
//             }
//             else
//             {
//                 youtube_info = await ytdl.getInfo(audio_url_row, {
//                     requestOptions:
//                     {
//                         localAddress: ip,
//                         family: family
//                     }
//                 });
//             }

//             if(youtube_info != undefined)
//             {
//                 available_address = ip,
//                 available_family = family;

//                 if(i != 0) //첫 시나리오에서 성공한게 아니면 failover가 잘 동작했으니 로그 하나 찍어주자
//                 {
//                     logger.warn(`Succeed Failover Scenario${i} of ytdl.getInfo! Available ipv${available_family}...${available_address}`);
//                 }

//                 break; //성공했다면
//             }
//         }
//         catch(err)
//         {
//             logger.warn(`Failed ytdl.getInfo... Using ipv${family}...${ip} err_message: ${err.message}, url: ${audio_url_row}`);

//             if(i == try_info_list.length - 1) //마지막 시도였다면
//             {
//                 logger.error(`Failed ytdl.getInfo... for all scenario throwing...`);
//                 throw err;
//             }
//         }  
//     }

//     const audio_format = ytdl.chooseFormat(youtube_info.formats, { 
//         filter: 'audioonly', 
//         quality: 'lowestaudio' 
//     }); //connReset 에러가 빈번히 발생하여 우선 구글링한 해법을 적용해본다. https://blog.huzy.net/308 -> 24.02.02 해결책은 아니었다.

//     if(audio_format == undefined) 
//     {
//         logger.error(`cannot found audio format from ${youtube_info}`);
//         error_message = `cannot found audio format from ${youtube_info}`;
//         return [undefined, undefined, error_message];
//     }

//     const audio_duration_ms = audio_format.approxDurationMs;
//     const audio_duration_sec = Math.floor((audio_duration_ms ?? 0) / 1000);
//     const audio_size = audio_format.contentLength;
//     const audio_bitrate = audio_format.averageBitrate;
//     const audio_byterate = audio_bitrate / 8;

//     if(audio_duration_sec > SYSTEM_CONFIG.custom_audio_ytdl_max_length) //영상 최대 길이 제한, 영상이 너무 길고 seek 지점이 영상 중후반일 경우 로드하는데 너무 오래 걸림
//     {
//         logger.warn(`${audio_url_row}'s duration[${audio_duration_sec}] is over then ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}`);
//         error_message = `${audio_url_row}'s 오디오 길이(${audio_duration_sec}초)가 ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}를 초과합니다.`;
//         return [undefined, undefined, error_message];
//     }

//     //최종 재생 길이 구하기, 구간 지정했으면 그래도 재생할 수 있는 최대치는 재생해줄거임
//     let audio_length_sec = (audio_play_time_row ?? 0) <= 0 ? Math.floor(option_data.quiz.audio_play_time / 1000) : audio_play_time_row; //얼만큼 재생할지

//     if(audio_start_row == undefined || audio_start_row >= audio_duration_sec) //시작 요청 값 없거나, 시작 요청 구간이 오디오 범위 넘어서면
//     {
//         audio_start_row = undefined; //구간 요청값 무시
//         audio_end_row = undefined;
//     }
//     else
//     {
//         if(audio_end_row == undefined || audio_end_row > audio_duration_sec) //끝 요청 값 없거나, 오디오 길이 초과화면 자동으로 최대치
//         {
//             audio_end_row = audio_duration_sec;
//         }

//         audio_length_sec = audio_end_row - audio_start_row; //우선 딱 구간만큼만 재생
//     }

//     if(audio_length_sec > audio_duration_sec) 
//     {
//         audio_length_sec = audio_duration_sec; //오디오 길이보다 더 재생할 순 없다.
//     }

//     if(audio_length_sec > max_play_time_sec) 
//     {
//         audio_length_sec = max_play_time_sec; //최대치를 넘어설 순 없다
//     }

//     audio_length_ms = audio_length_sec * 1000;


//     //오디오 시작 지점이 될 수 있는 포인트 범위
//     const audio_min_start_point_sec = audio_start_row ?? 0;
//     const audio_max_start_point_sec = (audio_end_row ?? Math.floor(audio_duration_ms/1000)) - audio_length_sec;

//     let audio_final_min_start_point_sec = audio_min_start_point_sec;
//     let audio_final_max_start_point_sec = audio_max_start_point_sec;

//     let audio_start_point = audio_min_start_point_sec;

//     //오디오 자르기 기능
//     if(audio_max_start_point_sec - audio_min_start_point_sec > audio_length_sec) //충분히 재생할 수 있는 구간이 지정돼 있어서 오디오 랜덤 구간 재생이 필요하다면
//     {
//         if(option_data.quiz.improved_audio_cut == OPTION_TYPE.ENABLED) //옵션 켜져있다면 최대한 중간 범위로 좁힌다.
//         {
//             const audio_mid_point_sec = Math.floor(audio_min_start_point_sec + (audio_max_start_point_sec - audio_min_start_point_sec) / 2); //두 지점의 중앙 포인트

//             //중앙 포인트 부터 audio_length_sec 의 절반씩
//             const audio_guess_min_start_point_sec = audio_mid_point_sec - Math.floor(audio_length_sec/2) + 1; //1s는 패딩
//             const audio_guess_max_start_point_sec = audio_mid_point_sec + Math.floor(audio_length_sec/2) + 1;

//             if(audio_min_start_point_sec <= audio_guess_min_start_point_sec && audio_guess_max_start_point_sec <= audio_max_start_point_sec) //좁히기 성공이면
//             {
//                 audio_final_min_start_point_sec = audio_guess_min_start_point_sec;
//                 audio_final_max_start_point_sec = audio_guess_max_start_point_sec;
//                 logger.debug(`Refined audio point, question: ${audio_url_row} min: ${audio_min_start_point_sec} -> ${audio_final_min_start_point_sec}, max: ${audio_max_start_point_sec} -> ${audio_final_max_start_point_sec}`);
//             }
//         }

//         audio_start_point = utility.getRandom(audio_final_min_start_point_sec, audio_final_max_start_point_sec)  //second
//     }
    
//     //이건 왜 안쓰지? 아놔 진짜 기억 안나네 아마 ffmpeg 프로세스 실행돼서 그럴듯
//     // audio_stream = ytdl.downloadFromInfo(youtube_info, { format: audio_format, range: {start: audio_start_point, end: audio_end_point} }); 
    
//     logger.debug(`cut audio, ${type}: ${audio_url_row}, point: ${audio_start_point} ~ ${(audio_start_point + audio_length_sec)}`);

//     const download_option = {
//         format: audio_format ,
//         opusEncoded: true,
//         // encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', `-to ${audio_end_point}`, `-fs ${10 * 1024 * 1024}`],

//         //10초 패딩 줬다, 패딩 안주면 재생할 시간보다 Stream이 짧아지면 EPIPE 에러 뜰 수 있음, -t 옵션은 duration임 (sec)
//         //패딩 주는 이유? ytdl core는 ffmpeg로 동작하는데 stream 데이터 읽어서 ffmpeg로 오디오 처리하고 pipe로 전달한다. 근데 pipe에서 read하는 ffmpeg 먼저 끝나면 읽지를 못해서 에러나지
//         encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', '-t', `${audio_length_sec + 10}`], 
//         seek: audio_start_point, 

//         dlChunkSize: 0, //disabling chunking is recommended in discord bot
//         bitrate: 128, //max bitrate for discord bot, (부스트 없는 서버 기준),
//         highWaterMark: AUDIO_BUFFER_SIZE //오디오 버퍼 사이즈(이게 connReset의 원인일까...?)
//     };

//     if(available_address != undefined && available_family != undefined) //잘 되는 ip 정보가 있다면
//     {
//         download_option['requestOptions'] = {
//             localAddress: available_address,
//             family: available_family
//         };

//         logger.debug(`found available address info!!! ${available_family}, ${available_address}`);
//     };

//     let audio_stream = ytdl(audio_url_row, download_option);

//      /** 
//     23.11.08 확인 결과 
//     -to 옵션이 안먹는다...
//     -> (`-to ${audio_length}`) 에서 ('-t', `${audio_length}`) 로 하니깐 된다.

//     23.11.15 
//     ytdl-core 를 업데이트했더니 getInfo가 안된다.
//     ytdl-core 를 원래 쓰던 버전인 4.9.1로 롤백했다(이후 버전은 버그가 많음)

//     23.11.16
//     ytdl-core 4.9.1 버전은 youtube 데이터 다운로드가 매우매우 느린 문제가 있다.
//     따라서 다시 최신 버전으로 업데이트 후, 아래의 이슈 확인하여 sig.js를 패치하였다.
//     https://github.com/fent/node-ytdl-core/issues/1250#issuecomment-1712550800 

//     getInfo 정상 동작 및 4.9.1 보다 youtube 데이터 다운로드 속도도 빠른걸 확인함
//     **/

//     /**
//      * 시도해 볼만한 방법들
//      * 1. MP3는 잘라도 재생이 잘 된다. MP3는 Discord에서 어떻게 변환하는지 확인하고 Webm과 차이점을 확인
//      * 2. 오디오를 전부 받고, Create Resource를 해준다. 그 다음 start_point를 지정한다.
//      * ㄴ start_point를 지정할 수 있는지도 불확실하고 성능면에서 비효율적이다.
//      * 3. 이미 Webm/opus 타입이다. inline 볼륨 꺼보고 해보자
//      * 4. discord-ytdl-core 라는게 있다. 좀 옛날거라 지금은 안될텐데 참고는 해보자
//      * 5. 정상적으로 돌아갈 때랑 잘렸을 때 edge 상태 확인
//      * 6. https://www.npmjs.com/package/discord-ytdl-core?activeTab=explore, 이건 discord-ytdl-core 의 소스코드다
//      * 확인해보면 ytdl 로 받은걸 ffmpeg 를 직접 만들고 실행하는걸 볼 수 있다. 이 중 seek 옵션이 있는데, 이게 시작 위치(second)이고 -t 옵션으로 duration, -to 옵션으로 ~~까지를 설정할 수 있다
//      * https://github.com/skdhg/discord-ytdl-core/issues/17
//      * 이게 되면 veryvery thank u T.T, => 6번으로 해결했다!!!!
//      */

//     audio_resource = createAudioResource(audio_stream, { //Opus로 실행해주면 된다.
//         inputType: StreamType.Opus,
//         inlineVolume: SYSTEM_CONFIG.use_inline_volume,
//     });

//     if(SYSTEM_CONFIG.use_inline_volume)
//     {
//         // resource.volume.setVolume(0);
//     }
    
//     return [audio_resource, audio_length_ms, undefined];
// }