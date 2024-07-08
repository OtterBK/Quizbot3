const { SYSTEM_CONFIG } = require('../../config/system_setting.js');
const logger = require('../../utility/logger.js')('AudioCacheManager');
const youtubedl = require('youtube-dl-exec');
const path = require('path');
const fs = require('fs');
const cloneDeep = require("lodash/cloneDeep.js");
const { json } = require('express');
const utility = require('../../utility/utility.js');

const DOWNLOAD_RESULT_TYPE = {
    SUCCESS: 0,
    ERROR: 1,
    OVER_DURATION: 2,
    OVER_MAX_FILE_SIZE: 3,
    ALREADY_EXIST: 3,
    NO_MATCH_FILTER: 4,
    VIDEO_UNAVAILABLE: 5,
    PRIVATE_VIDEO: 6,
    UNKNOWN: 9,
}

const getAudioCache = (cache_filename) => 
{
    const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;
    const cache_file_path = path.join(cache_path, cache_filename);

    if(fs.existsSync(cache_file_path))
    {
        return cache_file_path;
    }

    return undefined;
}

const getAudioCacheDuration = (cache_filename) =>
{
  const ext = path.extname(cache_filename);
  const base_name = path.basename(cache_filename, ext);
  const info_filename = `${base_name}.info.json`;

  const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;
  const info_file_path = path.join(cache_path, info_filename);
  const data = fs.readFileSync(info_file_path, 'utf8');
  const json_data = JSON.parse(data);
  const duration = json_data.duration;

  return duration;
}


const downloadAudioCache = async (audio_url, cache_file_name, ip_info={ipv4: undefined, ipv6: undefined}) => 
{
    const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;

    logger.debug(`Downloading Youtube Video Cache file... audio_url: ${audio_url}, filename: ${cache_file_name}`);

    const default_option = {
        paths: cache_path,
        output: cache_file_name,
        formatSort: '+size', //파일 크기로 오름차순 정렬
        format: 'bestaudio[ext=webm]', //정렬된 포맷 중 webm 확장자인것 -> 즉 webm이면서 파일 크기가 가장 작은거
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

    let causation_message = undefined;
    let result = undefined;

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
            logger.info(`Downloaded cache file ${cache_file_name}`);
            return {
                success: true,
                causation_message: undefined
            };
        }

        break; //에러도 아니고 성공도 아니면 예상된 문제들임
    }

    //다 해봤는데 실패한 경우임
    if(result.result_type == DOWNLOAD_RESULT_TYPE.ERROR)
    {
        logger.error(`Failed ytdl getInfo... for all scenario`);
        return {
            success: false,
            causation_message: `AUDIO_ERROR: 오디오 다운로드에 실패했습니다.\n해당 문제가 오래 지속될 경우 개발자에게 문의 바랍니다.`
        }
    }

    if(result.result_type == DOWNLOAD_RESULT_TYPE.OVER_DURATION)
    {
        logger.warn(`${audio_url}'s durations is over than ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}`);
        return {
            success: false,
            causation_message: `오디오 길이가 ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}초를 초과합니다.`
        }
    }

    if(result.result_type == DOWNLOAD_RESULT_TYPE.OVER_MAX_FILE_SIZE)
    {
        logger.warn(`${audio_url}'s all audio file size is over than ${SYSTEM_CONFIG.custom_audio_max_file_size}`);
        return {
            success: false,
            causation_message: `${audio_url}의 모든 오디오 파일 크기가 ${SYSTEM_CONFIG.custom_audio_max_file_size}를 초과합니다.`
        }
    }

    if(result.result_type == DOWNLOAD_RESULT_TYPE.VIDEO_UNAVAILABLE)
    {
        logger.warn(`${audio_url} is video unavailable`);
        return {
            success: false,
            causation_message: `${audio_url} 링크는 삭제된 오디오입니다.`
        }
    }

    if(result.result_type == DOWNLOAD_RESULT_TYPE.PRIVATE_VIDEO)
    {
        logger.warn(`${audio_url} is private video`);
        return {
            success: false,
            causation_message: `${audio_url} 링크는 비공개 오디오입니다.`
        }
    }

    if(result.result_type == DOWNLOAD_RESULT_TYPE.ALREADY_EXIST) //이럴수가 있나 싶긴한데... 
    {
        logger.warn(`${audio_url}'s cache is already exist`);
        return {
            success: true,
            causation_message: `${audio_url}의 캐시가 이미 존재합니다.`
        }
    }

    //그 외는 나도 몰겄다
    return {
        success: false,
        causation_message: `확인되지 않은 오류...(추후 고쳐두겠습니다.)`
    }
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
    }

    return {
        result_type: result_type,
        result_message: stdout,
        error_message: stderr
    };
}

const getDownloadResultType = (result_message) => 
{
    const lines = result_message.split('\n');

    for (let i = lines.length - 1; i >= 0; --i) 
    {
        const line = lines[i];
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

        if(line.includes("File is larger than max-filesize"))
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
        const lines = error_message.split('\n');
    
        for (let i = lines.length - 1; i >= 0; --i) 
        {
            const line = lines[i];
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
        }
        
        return DOWNLOAD_RESULT_TYPE.ERROR;
    }

const resetCache = () => 
{
    const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;
    const cache_files = fs.readdirSync(cache_path);

    cache_files.forEach(filename => {
        try
        {
            const file_path = path.join(cache_path, filename);

            if(filename.endsWith(".webm") || filename.endsWith(".json"))
            {
                fs.unlinkSync(file_path);
            }
        }
        catch(err)
        {
            console.error(`캐시${filename} 삭제 오류: `, err.message);
        }
    });
}

const forceCaching = async (audio_url_list_path) =>
{
    if(fs.existsSync(audio_url_list_path) == false)
    {
        console.log(`cannot find audio url list data: ${audio_url_list_path}`);
        return 0;
    }

    const audio_url_list_data = fs.readFileSync(audio_url_list_path, 'utf8');
    const audio_url_list = audio_url_list_data.split('\n');

    const cache_path = SYSTEM_CONFIG.custom_audio_cache_path;
    const cache_files = fs.readdirSync(cache_path);
    const cached_list = [];

    cache_files.forEach(filename => {
        cached_list.push(filename);
    });

    let new_cached_count = 0;
    let failed_count = 0;
    let failed_url_list = '';

    for (let i = 0; i < audio_url_list.length; i++) 
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
    
        const cache_file_name = `${video_id}.webm`;
        const cache_info_name = `${video_id}.info.json`
    
        if(cache_files.includes(cache_file_name) && cache_files.includes(cache_info_name))
        {
            console.log(`${video_id} is already cached. skip this`);
            continue;
        }
    
        const result = await downloadAudioCache(audio_url, cache_file_name);
    
        if(result.success == false)
        {
            console.error(`Failed to caching ${audio_url}. error: ${result.causation_message}`);
            failed_url_list += `${audio_url}\n`;
            ++failed_count;
            continue;
        }
    
        ++new_cached_count;
    }
    
    console.log(`new cached ${new_cached_count}!. failed ${failed_count}...`);
    if(failed_count > 0)
    {
        const failed_log_path = path.join(cache_path, `failed_url.txt`);
        fs.writeFileSync(failed_log_path, failed_url_list, 'utf-8');
    }

    return new_cached_count;
}


module.exports = { getAudioCache, getAudioCacheDuration, downloadAudioCache, resetCache, forceCaching };