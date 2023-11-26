/**
 * 음악파일을 webm 으로 바꿔줌
사용법

-r 경로명 (-r 은 recursive 옵션)
-r d:\cvt 라고 입력하면 cvt의 하위에 있는 모든 요소가 변환됨

**/

const fs = require('fs');
const readline = require('readline');
const pathToFfmpeg = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');
const { join, resolve } = require('path');

process.env.FFMPEG_PATH = pathToFfmpeg;

const scanner = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let convert_count = 0;
let total_count = 0;
let works = [];

waitForInput = async () => {
    scanner.question('input directory: ', async (line) => {
        const is_recursive = line.includes('-r');
        const dir_path = line.replace('-r', '').trim();

        total_count = await scan_directory(dir_path, is_recursive);
        console.log(`found target, ${total_count}`);

        const works = await convert_dir(dir_path, is_recursive);
        
        console.log(`finished converting count ${convert_count}/${total_count}`)
        waitForInput();
    });
}

waitForInput();

scan_directory = async (path, recursive=false) => {

    if(fs.existsSync(path) == false)
    {
        console.log(`no such file or directory, ${path}`);
        return;
    }

    const stat = fs.statSync(path);
    if(stat.isDirectory() == false)
    {
        console.log(`its not a directory, ${path}`);
        return;
    }

    const list = fs.readdirSync(path);
    let count = 0;

    for(let i = 0; i < list.length; ++i)
    {
        const item_path = join(path, list[i]);
        const stat = fs.statSync(item_path);
        if(stat.isDirectory() && recursive == true) {
            count += await scan_directory(item_path, recursive);
            continue;
        }

        if(checkTarget(item_path) == false) continue;

        ++count;
    }

    return count;

}

const convert_dir = async (path, recursive=false) => {

    if(fs.existsSync(path) == false)
    {
        console.log(`no such file or directory, ${path}`);
        return;
    }

    const stat = fs.statSync(path);
    if(stat.isDirectory() == false)
    {
        console.log(`its not a directory, ${path}`);
        return;
    }

    const list = fs.readdirSync(path);

    for(let i = 0; i < list.length; ++i)
    {
        const item_path = join(path, list[i]);
        const stat = fs.statSync(item_path);
        if(stat.isDirectory() && recursive == true) {
            await convert_dir(item_path, recursive);
        }
        else
        {
            const work = convert_file(item_path);
            if(work != undefined)
            {
                works.push(work);
                if(works.length >= 20)
                {
                    console.log(`start part works, ${works.length}`);
                    await Promise.all(works);
                    console.log(`done part works , ${works.length}`);
                    works.splice(0, works.length);
                }
            }
        }

        // //works가 너무 많으면 100개씩 분할
        // let parted_works = [];
        // let part = [];
        // for(let i = 1; i <= works.length; ++i) {
        //     part.push(works[i]);
        //     if(i % 100 == 0)
        //     {
        //         parted_works.push(part);
        //     }
        // }
        // parted_works.push(part);

        // for(let i = 0; i < parted_works.length; ++i)
        // {
        //     console.log(`started part, ${i}`);
        //     const parted_work = parted_works[i];
        //     await Promise.all(parted_work);
        // }

    }

    return works;

}

const checkTarget = (file_name) => {
    if(file_name.endsWith('.wav') == false &&  file_name.endsWith('.mp3') == false &&  file_name.endsWith('.ogg') == false) return false;
    return true;
}

const convert_file = (file_path) => {

    if(checkTarget(file_path) == false) return;

    console.log(`converting file ${file_path}`);

    let ffmpeg_handler = new ffmpeg(file_path);
    ffmpeg_handler.format('webm');

    let new_file_path = file_path.replace(/(.png|.jpg|.jpeg|.gif|.wav|.mp3|.ogg)$/,'');
    new_file_path += ".webm";

    return new Promise((resolve, reject)=>{ ffmpeg_handler.saveToFile(new_file_path)
        .on('end', function() {
            // console.log(`Finished covert ${new_file_path}`);
            fs.unlink(file_path, err => {
                if(err != null && err.code == 'ENOENT') 
                    console.log(`Failed to unlink ${file_path}, err: ${err.message}`);
                resolve();
            }); //기존 파일 삭제    
            ++convert_count;
            console.log(`processing... ${convert_count}/${total_count}`);
        })
        .on('error', function(err) {
            console.log('An error occurred: ' + new_file_path + " | " + err.message);
            fs.appendFile("convert_error.txt", 'An error occurred: ' + err.message + "\n", function (err) {
                if (err) console.log(err);
            });
            resolve();
        });
    });

}