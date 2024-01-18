echo "starting quizbot"
pkill -f 'node.*index.js'; 
echo "killed index.js"

pkill -f 'node.*bot.js'; 
echo "killed bot.js"

pkill -f ".*ffmpeg.*";
echo "killed all ffmpeg"

echo "wating for 5sec"
sleep 5
echo "started quizbot3"
export TZ='Asia/Seoul'
sudo node /home/ubuntu/quizbot3/index.js
