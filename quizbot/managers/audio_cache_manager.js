const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('AudioCacheManager');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const cloneDeep = require("lodash/cloneDeep.js");
const { json } = require('express');
const utility = require('../../utility/utility.js');
const ffmpeg_path = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpeg_path);

const DOWNLOAD_RESULT_TYPE = {
    SUCCESS: 0,
    ERROR: 1,
    OVER_DURATION: 2,
    OVER_MAX_FILE_SIZE: 3,
    ALREADY_EXIST: 4,
    NO_MATCH_FILTER: 5,
    VIDEO_UNAVAILABLE: 6,
    PRIVATE_VIDEO: 7,
    PREMIUM: 8,
    UNKNOWN: 10,
}

const getHashedPath = (target) => 
{
    if(target == undefined || target.length == 0)
    {
        return undefined;
    }

    const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;
    const sub_path = target.charAt(0).toUpperCase();
    
    return path.join(cache_path, sub_path);
}

const getAudioCache = (video_id) => 
{
    const cache_path = getHashedPath(video_id);
    let cache_file_path = path.join(cache_path, `${video_id}.webm`); //우선 webm으로 찾는다

    if(fs.existsSync(cache_file_path)) //바로 찾으면 개꿀~
    {
        return cache_file_path;
    }

    return undefined; //이제 webm으로 다 변환해두기 때문에 밑어 더 볼 필요는 없음

    //하 없으면 찾아보자
    const cache_info = getAudioCacheInfo(video_id);
    if(cache_info == undefined)
    {
        return undefined;
    }

    const cache_result = cache_info.cache_result;
    if(cache_result == undefined)
    {
        return undefined;
    }

    if(cache_result.success == false || cache_info.ext == undefined)
    {
        return undefined;
    }
    
    //캐싱 성공은 했어?
    const ext = cache_info.ext;
    cache_file_path = path.join(cache_path, `${video_id}.${ext}`);

    if(fs.existsSync(cache_file_path)) //다시 찾아보자
    {
        return cache_file_path;
    }

    return undefined;
}

const getAudioCacheInfo = (video_id) =>
{
  const cache_path = getHashedPath(video_id);
  const info_filename = `${video_id}.info.json`;
  const info_file_path = path.join(cache_path, info_filename);

  if(fs.existsSync(info_file_path) == false)
  {
    return undefined;
  }

  const stat = fs.statSync(info_file_path);
  if(stat.isFile() == false) //이건 뭔 경우냐...
  {
    fs.unlinkSync(info_file_path);
    return undefined;
  }

  const data = fs.readFileSync(info_file_path, 'utf8');
  const json_data = JSON.parse(data);

  return json_data;
}

const reWriteCacheInfo = (video_id, cache_result) =>
{
    try
    {
        logger.debug(`rewriting info file ${video_id}.info.json`);

        let cache_info = getAudioCacheInfo(video_id);

        if(cache_info == undefined)
        {
            logger.debug(`${video_id}'s info is not exists. generating cache info`);
            cache_info = {};
        }

        delete cache_info.formats;
        delete cache_info.thumbnails;
        delete cache_info.automatic_captions;
        delete cache_info.subtitles;
        delete cache_info.heatmap;

        if(cache_result != undefined)
        {
            cache_info['cache_result'] = cache_result;
        }

        const cache_path = getHashedPath(video_id);
        const info_filename = `${video_id}.info.json`;
        const info_file_path = path.join(cache_path, info_filename);

        if(fs.existsSync(cache_path) == false)
        {
            fs.mkdirSync(cache_path, { recursive: true });
        }
    
        fs.writeFileSync(info_file_path, JSON.stringify(cache_info), 'utf-8',  (err) => 
        {
            if (err) 
            {
                logger.error(`remove format info write error ${err.message}`);
            }
        });
    }
    catch(err)
    {
        logger.error(`rewrite cache info error. ${err.message}`);
    }
}

const downloadAudioCache = async (audio_url, video_id, ip_info={ipv4: undefined, ipv6: undefined}) => 
{
    const cache_path = getHashedPath(video_id);

    logger.debug(`Downloading Youtube Video Cache file... audio_url: ${audio_url}, video_id: ${video_id}`);

    const default_option = {
        paths: cache_path,
        output: `${video_id}.%(ext)s`,
        formatSort: '+size', //파일 크기로 오름차순 정렬
        format: 'bestaudio[ext=webm]/bestaudio', //정렬된 포맷 중 webm 확장자인것. 없으면 젤 작은 audio -> 즉 webm이면서 파일 크기가 가장 작은거
        maxFilesize: SYSTEM_CONFIG.custom_audio_max_file_size, //최대 파일 크기
        matchFilter: `duration <= ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}`, //최대 길이
        writeInfoJson: true, //비디오 정보 json으로 저장
        noCheckCertificates: true, //ssl 체크 안함
        noWarnings: true, //경로 미출력
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
    }

    //create download scenario
    let download_scenario = [];

    const { ipv4, ipv6 } = ip_info;
    if(ipv4 == undefined && ipv6 == undefined)
    {
        download_scenario.push(default_option);
    }
    else
    {
        if(ipv4 != undefined)
        {
            let ipv4_option = cloneDeep(default_option);
            ipv4_option["sourceAddress"] = ipv4;
            ipv4_option["forceIpv4"] = true;
            download_scenario.push(ipv4_option);
        }

        if(ipv6 != undefined)
        {
            let ipv6_option = cloneDeep(default_option);
            ipv6_option["sourceAddress"] = ipv6;
            ipv6_option["forceIpv6"] = true;
            download_scenario.push(ipv6_option);
        }
    }

    logger.debug(`Downloading cache scenario is ${download_scenario.length}`);

    let result = undefined;
    let cache_result = {};

    while(download_scenario.length > 0)
    {
        const yt_dlp_option = download_scenario.pop(); //stack
        result = await executeDownloadProcess(audio_url, yt_dlp_option);

        if(result.result_type == DOWNLOAD_RESULT_TYPE.ERROR) //에러발생했으면 다시 ㄱㄱ임
        {
            logger.warn(`Failed yt-dlp download... Using ip:${yt_dlp_option.sourceAddress}, url: ${audio_url}, err_message: ${result.error_message}, `);
            continue;
        }

        if(result.result_type == DOWNLOAD_RESULT_TYPE.SUCCESS) //성공이면 바로 반환 ^^
        {
            cache_result = {
                success: true,
                causation_message: '',
                need_retry: false
            };

            logger.info(`Downloaded cache file ${video_id}`);

            reWriteCacheInfo(video_id, cache_result);
            
            await convertToWebm(video_id); 
            
            return cache_result;
        }

        break; //에러도 아니고 성공도 아니면 예상된 문제들임
    }

    //다 해봤는데 실패한 경우임
    if(result.result_type == DOWNLOAD_RESULT_TYPE.ERROR)
    {
        logger.error(`Failed ytdlp download audio... for all scenario`);

        cache_result = {
            success: false,
            causation_message: `오디오 다운로드에 실패했습니다.\n해당 문제가 오래 지속될 경우 개발자에게 문의 바랍니다.`,
            need_retry: true
        }

        logFailedUrl(audio_url);
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.OVER_DURATION)
    {
        logger.warn(`${audio_url}'s durations is over than ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}`);
        cache_result = {
            success: false,
            causation_message: `오디오 길이가 ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}초를 초과합니다.`,
            need_retry: false
        }
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.OVER_MAX_FILE_SIZE)
    {
        logger.warn(`${audio_url}'s all audio file size is over than ${SYSTEM_CONFIG.custom_audio_max_file_size}`);
        cache_result = {
            success: false,
            causation_message: `${audio_url}의 모든 오디오 파일 크기가 ${SYSTEM_CONFIG.custom_audio_max_file_size}를 초과합니다.`,
            need_retry: false
        }
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.VIDEO_UNAVAILABLE)
    {
        logger.warn(`${audio_url} is video unavailable`);
        cache_result = {
            success: false,
            causation_message: `${audio_url} 링크는 삭제된 오디오입니다.`,
            need_retry: false
        }
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.PRIVATE_VIDEO)
    {
        logger.warn(`${audio_url} is private video`);
        cache_result = {
            success: false,
            causation_message: `${audio_url} 링크는 비공개 오디오입니다.`,
            need_retry: false
        }
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.ALREADY_EXIST) //이럴수가 있나 싶긴한데... 
    {
        logger.warn(`${audio_url}'s cache is already exist`);
        cache_result = {
            success: true,
            causation_message: '',
            need_retry: false
        }
    }
    else if(result.result_type == DOWNLOAD_RESULT_TYPE.PREMIUM) 
    {
        logger.warn(`${audio_url} is premium music`);
        cache_result = {
            success: true,
            causation_message: `${audio_url} 링크는 유튜브 프리미엄 뮤직입니다.`,
            need_retry: false
        }
    }
    else
    {
        logger.warn(`Unknown result message url: ${audio_url}, stdout: ${result.result_message}`);
        logger.debug(`${audio_url}'s stdout: ${result.result_message}`);

        //그 외는 나도 몰겄다
        cache_result = {
            success: false,
            causation_message: `확인되지 않은 오류...(추후 고쳐두겠습니다.)`,
            need_retry: true
        }

        logFailedUrl(audio_url);
    }

    reWriteCacheInfo(video_id, cache_result);
    return cache_result;
}

const executeDownloadProcess = async (audio_url, yt_dlp_option) =>
{
    const subprocess = youtubedl.exec(
        audio_url, 
        yt_dlp_option,
        {
            timeout: 10000,
            killSignal: 'SIGKILL'
        }
    );       

    let result_type = DOWNLOAD_RESULT_TYPE.ERROR;
    let stdout = '';
    let stderr = '';

    // 표준 출력 스트림 데이터 수집
    stdout = subprocess.stdout.on('data', (data) => {
        stdout += data.toString();
    });

    // 표준 오류 스트림 데이터 수집
    stderr = subprocess.stderr.on('data', (data) => {
        stderr += data.toString();
    });

    try
    {
        await subprocess;

        result_type = getDownloadResultType(stdout);
    }
    catch(err)
    {
        logger.debug(`download process error occurred! ${err.message}`);

        result_type = getExpectedErrorType(stderr);

        logger.error(`its unknown type error: ${err}`);
    }

    return {
        result_type: result_type,
        result_message: stdout.toString(),
        error_message: stderr.toString()
    };
}

const getDownloadResultType = (result_message) => 
{
    const lines = result_message.split('\n');

    for (let i = lines.length - 1; i >= 0; --i) 
    {
        const line = lines[i].trim();
        if(line.startsWith('[download]') == false)
        {
            continue;
        }

        if(line.includes("has already been downloaded"))
        {
            return DOWNLOAD_RESULT_TYPE.ALREADY_EXIST;
        }

        if(line.includes("does not pass filter"))
        {
            if(line.includes("duration"))
            {
                return DOWNLOAD_RESULT_TYPE.OVER_DURATION;
            }

            return DOWNLOAD_RESULT_TYPE.NO_MATCH_FILTER;
        }

        if(line.includes("File is larger"))
        {
            return DOWNLOAD_RESULT_TYPE.OVER_MAX_FILE_SIZE;
        }

        if(line.includes("Video unavailable"))
        {
            return DOWNLOAD_RESULT_TYPE.VIDEO_UNAVAILABLE;
        }

        if(line.includes("Private video"))
        {
            return DOWNLOAD_RESULT_TYPE.PRIVATE_VIDEO;
        }

        if(line.includes("Destination:"))
        {
            return DOWNLOAD_RESULT_TYPE.SUCCESS;
        }
    }
    
    return DOWNLOAD_RESULT_TYPE.UNKNOWN;
}

const getExpectedErrorType = (error_message) => 
{
    if(error_message == undefined || (typeof error_message !== 'string' && !(error_message instanceof String)))
    {
        return DOWNLOAD_RESULT_TYPE.ERROR;
    }

    const lines = error_message.split('\n');

    for (let i = lines.length - 1; i >= 0; --i) 
    {
        const line = lines[i].trim();
        if(line.includes('ERROR:') == false)
        {
            continue;
        }

        if(line.includes("Video unavailable"))
        {
            return DOWNLOAD_RESULT_TYPE.VIDEO_UNAVAILABLE;
        }

        if(line.includes("Private video"))
        {
            return DOWNLOAD_RESULT_TYPE.PRIVATE_VIDEO;
        }

        if(line.includes("Music Premium"))
        {
            return DOWNLOAD_RESULT_TYPE.PREMIUM;
        }
    }
    
    return DOWNLOAD_RESULT_TYPE.ERROR;
}

const logFailedUrl = (url_list) =>
{
    const cache_root_path = SYSTEM_CONFIG.custom_audio_cache_path;
    const failed_url_path = path.join(cache_root_path, "failed_url.txt");
    fs.appendFile(failed_url_path, `${url_list}\n`, 'utf8', (err) => 
    {
        if (err) 
        {
          console.error(`Log Failed Url write url_list: ${url_list}, error: ${err.message}`);
        } 
    });
}

const convertToWebm = (video_id) => 
{
    if(video_id == undefined)
    {
        return;
    }

    const cache_info = getAudioCacheInfo(video_id);
    if(cache_info == undefined)
    {
        return;
    }

    const ext = cache_info.ext;
    if(ext == 'webm') //이미 webm이면 패스
    {
        return;
    }

    const cache_file_path = path.join(getHashedPath(video_id), `${video_id}.${ext}`);
    if(fs.existsSync(cache_file_path) == false) //변환 대상 찾아보자
    {
        logger.error(`convert target ${cache_file_path} is not exists`);
        return;
    }

    const converted_file_name = path.basename(cache_file_path, path.extname(cache_file_path)) + '.webm';
    const converted_file_path = path.resolve(path.dirname(cache_file_path), converted_file_name);

    logger.info(`converting file ${video_id}.${ext} to webm`);

    let ffmpeg_handler = new ffmpeg(cache_file_path);
    ffmpeg_handler.format('webm');

    return new Promise((resolve, reject)=>{ 
        
        ffmpeg_handler.saveToFile(converted_file_path)
        .on('end', function() 
        {
            resolve();
            
            logger.info(`converted to ${converted_file_path}`);

            fs.unlink(cache_file_path, err => 
            {
                if(err != null && err.code == 'ENOENT') 
                {
                    console.log(`Failed to unlink ${cache_file_path}, err: ${err.message}`);
                }
            }); //기존 파일 삭제    
        })
        .on('error', function(err) 
        {
            logger.error(`converting error occurred!: ${converted_file_path}, ${err.message}`);
            resolve();
        });
    });
}

const forceCaching = async (audio_url_list_path, thread_index=0) =>
{
    if(fs.existsSync(audio_url_list_path) == false)
    {
        console.log(`cannot find audio url list data: ${audio_url_list_path}`);
        return 0;
    }

    const audio_url_list_data = fs.readFileSync(audio_url_list_path, 'utf8');
    const audio_url_list = audio_url_list_data.split('\n');

    let new_cached_count = 0;
    let failed_count = 0;
    let failed_url_list = '';

    for (let i = 0; i < audio_url_list.length; i++) 
    {
        try
        {
            console.log(`caching... ${i+1} / ${audio_url_list.length}`);

            const audio_url = audio_url_list[i];
        
            if(audio_url == undefined || audio_url.trim() == '')
            {
                continue;
            }
        
            const video_id = utility.extractYoutubeVideoID(audio_url);
            if(video_id == undefined)
            {
                console.error(`${audio_url} has no video id`);
                failed_url_list += `${audio_url}\n`;
                ++failed_count;
                continue;
            }
        
            const cache_file_path = getAudioCache(video_id);
            const cache_info = getAudioCacheInfo(video_id);

            if(cache_file_path != undefined && cache_info != undefined)
            {
                console.log(`${video_id} is already cached. skip this`);
                continue;
            }

            if(cache_info?.cache_result?.need_retry == false) //이 경우 어차피 재시도해도 캐싱 안되는건 똑같은거임
            {
                console.log(`Skip downloading cache reason: ${cache_info.cache_result.causation_message}`);
                continue;
            }
        
            const result = await downloadAudioCache(audio_url, video_id);
        
            if(result.success == false)
            {
                console.error(`Failed to caching ${audio_url}. error: ${result.causation_message}`);
    
                if(result.need_retry == false)
                {
                    console.warn(`Do not need to retry... skip this`);
                    continue;
                }
    
                failed_url_list += `${audio_url}\n`;
                ++failed_count;
                continue;
            }
        
            ++new_cached_count;
        }
        catch(err)
        {
            console.error(`Error occurred! ${err.stack}`);
        }
    }
    
    console.log(`new cached ${new_cached_count}!. failed ${failed_count}...`);
    if(failed_count > 0)
    {
        const failed_log_path = path.join(SYSTEM_CONFIG.custom_audio_cache_path, `failed_url${thread_index}.txt`);
        fs.writeFileSync(failed_log_path, failed_url_list, 'utf-8');
    }

    return new_cached_count;
}

module.exports = { getAudioCache, getAudioCacheInfo, downloadAudioCache, reWriteCacheInfo, forceCaching };
