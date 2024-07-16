echo "stopping quizbot"

sudo pkill -f ".*quizbot_start.sh.*"
echo "stopped start script";

sudo pkill -f 'node.*index.js'; 
echo "killed index.js"

sudo pkill -f 'node.*bot.js'; 
echo "killed bot.js"

sudo pkill -f ".*ffmpeg.*";
echo "killed all ffmpeg"

echo "stopped"
