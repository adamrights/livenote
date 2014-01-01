var express = require('express')
, app = express()
, http = require('http')
, server = http.createServer(app)
, io = require('socket.io').listen(server)
, sqlite3 = require('sqlite3');

if(process.env.OPENSHIFT_NODEJS_PORT){
  io.enable('browser client minification');  // send minified client
  io.enable('browser client etag');          // apply etag caching logic based on version number
  io.enable('browser client gzip');          // gzip the file
  io.set('log level', 1);                    // reduce logging
  io.set('transports', ['websocket']);
}

var port = process.env.OPENSHIFT_NODEJS_PORT || 8000
, ip = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";

server.listen(port,ip);

var livenotes = new Object();
var databaseLoc = (process.env.OPENSHIFT_DATA_DIR)?process.env.OPENSHIFT_DATA_DIR+"livenote.sqlite3" : "livenote.sqlite3";
var db = new sqlite3.Database(databaseLoc); 
db.run("CREATE TABLE notes (id TEXT PRIMARY KEY, note TEXT, updateTime INTEGER)",function(err){
  //console.log(err);
});


io.sockets.on('connection', function (socket) {
  var tout;
  socket.on('getNote', function (data) {
    socket.join(data.id);
    var clientNumber = io.sockets.clients(data.id).length;
    socket.broadcast.to(data.id).emit('clientChange', {num:clientNumber});
    if(livenotes[data.id]){
      socket.emit('setNote', { note: livenotes[data.id],num:clientNumber});
    } else {
      db.get("SELECT id,note FROM notes WHERE id = ?",[data.id],function(err,row){
        if(row){
          socket.emit('setNote', { note: decodeURIComponent(row.note),num:clientNumber});
          livenotes[data.id] = decodeURIComponent(row.note);
        } else {
          socket.emit('setNote', { note: "" ,num: clientNumber});
          livenotes[data.id] = "";
        }
      //res.send(row.note);
      });
    }
  });

  socket.on("changeNote",function(data){
    clearTimeout(tout);
    socket.broadcast.to(data.id).emit('changeBackNote', data);
    var newval = livenotes[data.id];
    var op = data.op;
    if(op.d!==null) {
      newval = newval.slice(0,op.p)+newval.slice(op.p+op.d);
    }
    if(op.i!==null){
      newval = newval.insert(op.p,op.i);
    } 
    livenotes[data.id] = newval;
    tout = setTimeout(function(){
      db.run("INSERT OR REPLACE INTO notes ('id', 'note','updateTime') VALUES (?,?,?)",[data.id,encodeURIComponent(newval),new Date().valueOf()]);
    },2000);
  });



  socket.on("disconnect",function(){
    var room = Object.keys(io.sockets.manager.roomClients[socket.id]);
    room.splice(room.indexOf(""),1);
    room = room[0].substring(1);
    socket.leave(room);
    var clientNumber = io.sockets.clients(room).length;
    if(clientNumber==0){
      delete livenotes[room];
    } else {
      socket.broadcast.to(room).emit('clientChange', {num:clientNumber});
    }
  });
});

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

app.get('/:id', function (req, res) {
  res.sendfile(__dirname + '/notes.html');
//  res.send(req.params.id);
});

app.use("/public", express.static(__dirname + "/public"));


String.prototype.insert = function (index, string) {
  if (index > 0)
    return this.substring(0, index) + string + this.substring(index, this.length);
  else
    return string + this;
};



