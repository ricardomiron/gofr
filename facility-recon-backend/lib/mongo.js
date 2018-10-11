require('./init');
const winston = require('winston')
const crypto = require('crypto')
const models = require('./models')
const mongoose = require('mongoose')
const async = require('async')
const config = require('./config')

const database = config.getConf('mCSD:database')
const mongoUser = config.getConf('mCSD:databaseUser')
const mongoPasswd = config.getConf('mCSD:databasePassword')
const mongoHost = config.getConf('mCSD:databaseHost')
const mongoPort = config.getConf('mCSD:databasePort')
if (mongoUser && mongoPasswd) {
  var uri = `mongodb://${mongoUser}:${mongoPasswd}@${mongoHost}:${mongoPort}/${database}`;
} else {
  var uri = `mongodb://${mongoHost}:${mongoPort}/${database}`;
}

module.exports = function () {
  return {
    addServer(fields, callback) {
      let password = this.encrypt(fields.password)
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.SyncServers.findOne({
          host: fields.host,
        }, (err, data) => {
          if (err) {
            winston.error('Unexpected error occured,please retry');
            return callback('Unexpected error occured,please retry', null);
          }
          if (!data) {
            const syncServer = new models.SyncServers({
              name: fields.name,
              host: fields.host,
              sourceType: fields.sourceType,
              username: fields.username,
              password: password,
            });
            syncServer.save((err, data) => {
              if (err) {
                winston.error('Unexpected error occured,please retry')
                return callback('Unexpected error occured,please retry', null)
              }
              return callback(false, password)

            });
          } else {
            models.SyncServers.findByIdAndUpdate(data.id, {
              name: fields.name,
              host: fields.host,
              sourceType: fields.sourceType,
              username: fields.username,
              password: password,
            }, (err, data) => {
              if (err) {
                winston.error('Unexpected error occured,please retry');
                return callback('Unexpected error occured,please retry');
              }
              return callback(false, password)
            });
          }
        });
      })
    },
    editServer(fields, callback) {
      let password = this.encrypt(fields.password)
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.SyncServers.findByIdAndUpdate(fields.id, {
          name: fields.name,
          host: fields.host,
          sourceType: fields.sourceType,
          username: fields.username,
          password: password,
        }, (err, data) => {
          if (err) {
            winston.error(err);
            return callback('Unexpected error occured,please retry');
          }
          return callback(false, password)
        });
      })
    },

    deleteServer(id, callback) {
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.SyncServers.deleteOne({
          _id: id,
        }, (err, data) => {
          return callback(err, data);
        });
      })
    },

    getServers(callback) {
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.SyncServers.find({}).lean().exec({}, (err, data) => {
          if (err) {
            winston.error(err);
            return callback('Unexpected error occured,please retry');
          }
          callback(err, data)
        });
      })
    },
    addDataSource(sources, callback) {
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.DataSources.find({'status': 'active'}).lean().exec({}, (err, data) => {
          if (data) {
            async.each(data, (dt, nxtDt) => {
              models.DataSources.findByIdAndUpdate(dt._id, {'status': 'inactive'}, (err, data) => {
                return nxtDt()
              })
            }, () => {
              add(sources, (err, res) => {
                return callback(err, res)
              })
            })
          } else {
            add(sources, (err, res) => {
              return callback(err, res)
            })
          }
        })
      })

      function add(sources, callback) {
        let source1 = JSON.parse(sources.source1)
        let source2 = JSON.parse(sources.source2)
        models.DataSources.findOneAndUpdate({
          'source1': source1._id,
          'source2': source2._id
        }, {
          source1: source1._id,
          source2: source2._id,
          status: 'active'
        }, (err, data) => {
          if (err) {
            return callback(err,false)
          }
          if (!data) {
            const dataSourcePair = new models.DataSources({
              source1: source1._id,
              source2: source2._id,
              status: 'active'
            })
            dataSourcePair.save()
            return callback(false,true)
          }
          return callback(false, true)
        })
      }
    },
    resetDataSources(callback) {
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.DataSources.update({'status': 'active'},{'status': 'inactive'},{'multi': true},(err,data) => {
          return callback(err,data)
        })
      })
    },
    getDataSources(callback) {
      mongoose.connect(uri);
      let db = mongoose.connection
      db.on("error", console.error.bind(console, "connection error:"))
      db.once("open", () => {
        models.DataSources.find({'status': 'active'}).lean().exec({},(err,data) => {
          return callback(err, data)
        })
      })
    },
    encrypt(text) {
      let algorithm = config.getConf('encryption:algorithm');
      let secret = config.getConf('encryption:secret');
      var cipher = crypto.createCipher(algorithm, secret)
      var crypted = cipher.update(text, 'utf8', 'hex')
      crypted += cipher.final('hex');
      return crypted;
    },
    decrypt(text) {
      let algorithm = config.getConf('encryption:algorithm');
      let secret = config.getConf('encryption:secret');
      var decipher = crypto.createDecipher(algorithm, secret)
      var dec = decipher.update(text, 'hex', 'utf8')
      dec += decipher.final('utf8');
      return dec;
    }
  };
};
