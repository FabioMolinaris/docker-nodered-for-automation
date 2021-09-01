const readline = require('readline');
const net = require('net');
const PIPE_PATH = '/tempcontainer/HmiRuntime';

module.exports = function(RED) {
  function HmiRuntimeSubscribeTagsNode(config) {
    RED.nodes.createNode(this, config);

    // JSON object for output message of this node
    const msg = { payload: {} };

    const node = this;

    const client = net.connect(PIPE_PATH, function() {
      node.log('Socket connection to /tempcontainer/HmiRuntime successfully established.');

      subscribeTags();

      const rl = readline.createInterface({
        input: client,
        crlfDelay: Infinity
      });
      // Unified response
      rl.on('line', (line) => {
        msg.payload = JSON.parse(line);
        node.send(msg);
      });
      //Unified request
      function subscribeTags() {
        // add all user defined tags to JSON object for subscription
        const tags = config.tags.split(' ');
        const subscribeTagsObject = { Message: 'SubscribeTag', Params: { Tags: tags }, ClientCookie: 'NodeRedCookieForSubscribeTags' };
        // convert JSON object to string and add \n
        const subscribeTagsCmd = JSON.stringify(subscribeTagsObject) + '\n';
        // subscribe
        client.write(subscribeTagsCmd);
      }
    });
    client.on('end', function() {
      node.log('Socket connection has been closed. Try to reconnect.');
    });
  }
  RED.nodes.registerType('hmi-subscribe-tags', HmiRuntimeSubscribeTagsNode);
};
