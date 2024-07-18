echo "starting quizbot"

sudo pkill -f 'node.*index.js'; 
echo "killed index.js"

sudo pkill -f 'node.*bot.js'; 
echo "killed bot.js"

sudo  pkill -f ".*ffmpeg.*";
echo "killed all ffmpeg"

echo "wating for 5sec"
sleep 5
echo "started quizbot3"
export TZ='Asia/Seoul'
node /home/ubuntu/quizbot3/index.js
