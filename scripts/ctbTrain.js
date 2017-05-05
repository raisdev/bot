const AWS = require('aws-sdk');

const piSQS = process.env.PI_QUEUE;
const SQS = new AWS.SQS({region: 'us-east-1'});

module.exports = (robot) => {
  robot.hear(/ctb train/i, (msg) => {

    const message_payload = { action: 'play_sound', sound: 'train' };

    SQS.sendMessage({
       MessageBody: JSON.stringify(message_payload),
       QueueUrl: piSQS
    })
    .promise()
    .then((data) => { console.log('Heard CTB Train and queued message'); })
    .catch((err) => { console.log(err); });
  })
}
