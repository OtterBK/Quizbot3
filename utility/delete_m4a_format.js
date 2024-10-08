const fs = require('fs');
const path = require('path');

// 지정된 폴더 경로를 여기에 설정하세요.
const targetDir = 'G:/quizdata/cache/';

let deletedCount = 0;

// 비동기적으로 파일 및 폴더를 순회하는 함수
const traverseDirectory = async (dir) => 
{
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) 
  {
    const fullPath = path.join(dir, entry.name);
        
    if (entry.isDirectory()) 
    {
      await traverseDirectory(fullPath);
    }
    else if (entry.isFile() && entry.name.endsWith('.info.json')) 
    {
      const id = entry.name.replace('.info.json', '');
      await processFile(fullPath, id, dir);
    }
  }
};

// 파일을 처리하는 함수
const processFile = async (filePath, id, dir) => 
{
  try 
  {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    const json = JSON.parse(data);
        
    if (json.audio_ext !== 'webm') 
    {
      const correspondingFile = path.join(dir, `${id}.webm`);

      console.log(`deleting ${id}`);

      await fs.promises.unlink(filePath);
      deletedCount++;

      if (fs.existsSync(correspondingFile)) 
      {
        await fs.promises.unlink(correspondingFile);
        deletedCount++;
      }
    }
  }
  catch (error) 
  {
    console.error(`Error processing file ${filePath}:`, error);
  }
};

// 메인 함수
const main = async () => 
{
  await traverseDirectory(targetDir);
  console.log(`Deleted ${deletedCount} files.`);
};

main().catch(error => console.error('Error:', error));
