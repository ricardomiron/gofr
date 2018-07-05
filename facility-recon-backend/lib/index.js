
require('./init');

const express = require('express');
const bodyParser = require('body-parser');
// const oauthserver = require('node-oauth2-server')
// const oAuthModel = require('./oauth/model')()
const uuid5 = require('uuid/v5');
const formidable = require('formidable');
const winston = require('winston');
const https = require('https');
const http = require('http');
const config = require('./config');
const mcsd = require('./mcsd')();
const scores = require('./scores')();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// socket config - large documents can cause machine to max files open

//https.globalAgent.maxSockets = 5;
//http.globalAgent.maxSockets = 5;
// app.use(app.oauth.errorHandler());
/* app.oauth = oauthserver({
  model: oAuthModel,
  grants: ['password'],
  accessTokenLifetime:config.getConf('oauth:accessTokenLifetime'),
  debug: config.getConf('oauth:debug')
});

// get access token
// app.all('/oauth/token', app.oauth.grant());

// register user
app.post('/oauth/registerUser', (req, res) => {
  oAuthModel.saveUsers(req.body.firstname, req.body.lastname, req.body.username, req.body.password, req.body.email, (err) => {
    if (err) {
      res.status(401).send(err);
    } else {
      res.send('User Created');
    }
  });
});
*/

app.get('/countLevels/:orgid', (req, res) => {
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
  } else {
    const orgid = req.params.orgid;
    winston.info(`Getting total levels for ${orgid}`);
    mcsd.countLevels('DATIM', orgid, (err, totalLevels) => {
      res.set('Access-Control-Allow-Origin', '*');
      if (err) {
        winston.error(err);
        res.status(401).json({ error: 'Missing Orgid' });
      } else {
        const recoLevel = 2;
        winston.info(`Received total levels of ${totalLevels} for ${orgid}`);
        res.status(200).json({ totalLevels, recoLevel });
      }
    });
  }
});

app.get('/hierarchy/:source', (req, res) => {
  if (!req.query.OrgId || !req.query.OrgName || !req.params.source) {
    winston.error({ error: 'Missing Orgid or source' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid or source' });
  } else {
    const orgid = req.query.OrgId;
    const source = req.params.source.toUpperCase();
    if (source == 'DATIM') var database = config.getConf('mCSD:database');
    else if (source == 'MOH') var database = orgid;

    winston.info(`Fetching ${source} Locations For ${orgid}`);
    if (source == 'MOH') {
      var database = orgid;
      const namespace = config.getConf('UUID:namespace');
      var id = uuid5(orgid, `${namespace}000`);
    } else if (source == 'DATIM') {
      var id = orgid;
      var database = config.getConf('mCSD:database');
    }

    mcsd.getLocationChildren(database, id, (mcsdData) => {
      winston.info(`Done Fetching ${source} Locations`);
      winston.info(`Creating ${source} Tree`);
      mcsd.createTree(mcsdData, source, database, orgid, (tree) => {
        winston.info(`Done Creating ${source} Tree`);
        res.set('Access-Control-Allow-Origin', '*');
        res.status(200).json(tree);
      });
    });
  }
});

app.get('/reconcile/:orgid/:totalLevels/:recoLevel', (req, res) => {
  if (!req.params.orgid || !req.params.recoLevel) {
    winston.error({ error: 'Missing Orgid or reconciliation Level' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid or reconciliation Level' });
  } else {
    winston.info('Getting scores');
    const orgid = req.params.orgid;
    const recoLevel = req.params.recoLevel;
    const totalLevels = req.params.totalLevels;
    const datimDB = config.getConf('mCSD:database');
    const mohDB = orgid;
    const namespace = config.getConf('UUID:namespace');
    const mohTopId = uuid5(orgid, `${namespace}000`);
    const datimTopId = orgid;
    let mcsdDatimAll = null;
    let mcsdMohAll = null;
    const datimLocationReceived = new Promise((resolve, reject) => {
      mcsd.getLocationChildren(datimDB, datimTopId, (mcsdDATIM) => {
        mcsdDatimAll = mcsdDATIM;
        mcsd.filterLocations(mcsdDATIM, datimTopId, 0, recoLevel, 0, (mcsdDatimTotalLevels, mcsdDatimLevel, mcsdDatimBuildings) => {
          resolve(mcsdDatimLevel);
        });
      });
    });

    const mohLocationReceived = new Promise((resolve, reject) => {
      mcsd.getLocationChildren(mohDB, mohTopId, (mcsdMOH) => {
        mcsdMohAll = mcsdMOH;
        mcsd.filterLocations(mcsdMOH, mohTopId, 0, recoLevel, 0, (mcsdMohTotalLevels, mcsdMohLevel, mcsdMohBuildings) => {
          resolve(mcsdMohLevel);
        });
      });
    });

    const mappingDB = config.getConf('mapping:dbPrefix') + orgid;
    const mappingLocationReceived = new Promise((resolve, reject) => {
      mcsd.getLocationByID(mappingDB, false, false, (mcsdMapped) => {
        resolve(mcsdMapped);
      });
    });

    Promise.all([datimLocationReceived, mohLocationReceived, mappingLocationReceived]).then((locations) => {
      if (recoLevel == totalLevels) {
        scores.getBuildingsScores(locations[1], locations[0], locations[2], mcsdDatimAll, mcsdMohAll, mohDB, datimDB, mohTopId, datimTopId, recoLevel, totalLevels, (scoreResults) => {
          res.set('Access-Control-Allow-Origin', '*');
          res.status(200).json({ scoreResults, recoLevel });
          winston.info('Score results sent back');
        });
      } else {
        scores.getJurisdictionScore(locations[1], locations[0], locations[2], mcsdDatimAll, mohDB, datimDB, mohTopId, datimTopId, recoLevel, totalLevels, (scoreResults) => {
          res.set('Access-Control-Allow-Origin', '*');
          res.status(200).json({ scoreResults, recoLevel });
          winston.info('Score results sent back');
        });
      }
    });
  }
});

app.get('/getUnmatched/:orgid/:source/:recoLevel', (req, res) => {
  winston.info(`Getting DATIM Unmatched Orgs for ${req.params.orgid}`);
  if (!req.params.orgid || !req.params.source) {
    winston.error({ error: 'Missing Orgid or Source' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid or Source' });
    return;
  }
  const orgid = req.params.orgid;
  const source = req.params.source.toUpperCase();
  const recoLevel = req.params.recoLevel;
  const datimDB = config.getConf('mCSD:database');
  mcsd.getLocationChildren(datimDB, orgid, (locations) => {
    mcsd.filterLocations(locations, orgid, 0, recoLevel, 0, (mcsdLevels, mcsdLevel, mcsdBuildings) => {
      scores.getUnmatched(locations,mcsdLevel, orgid, (unmatched) => {
        winston.info(`sending back DATIM unmatched Orgs for ${req.params.orgid}`);
        res.set('Access-Control-Allow-Origin', '*');
        res.status(200).json(unmatched);
      });
    });
  });
});

app.post('/match/:type/:orgid', (req, res) => {
  winston.info('Received data for matching');
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
    return;
  }
  const orgid = req.params.orgid;
  const type = req.params.type;
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    let mohId = fields.mohId;
    const datimId = fields.datimId;
    const recoLevel = fields.recoLevel;
    const totalLevels = fields.totalLevels;
    if (!mohId || !datimId) {
      winston.error({ error: 'Missing either MOHID or DATIMID or both' });
      res.set('Access-Control-Allow-Origin', '*');
      res.status(401).json({ error: 'Missing either MOHID or DATIMID or both' });
      return;
    }
    if (recoLevel == totalLevels) {
      const namespace = config.getConf('UUID:namespace');
      mohId = uuid5(mohId, `${namespace}100`);
    }
    mcsd.saveMatch(mohId, datimId, orgid, recoLevel, totalLevels, type, (err) => {
      winston.info('Done matching');
      res.set('Access-Control-Allow-Origin', '*');
      if (err) res.status(401).send({ error: err });
      else res.status(200).send();
    });
  });
});

app.post('/acceptFlag/:orgid', (req, res) => {
  winston.info('Received data for marking flag as a match');
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
    return;
  }
  const orgid = req.params.orgid;
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    const datimId = fields.datimId;
    const recoLevel = fields.recoLevel;
    const totalLevels = fields.totalLevels;
    if (!datimId) {
      winston.error({ error: 'Missing DATIMID' });
      res.set('Access-Control-Allow-Origin', '*');
      res.status(401).json({ error: 'Missing DATIMID' });
      return;
    }
    if (recoLevel == totalLevels) {
      const namespace = config.getConf('UUID:namespace');
      mohId = uuid5(mohId, `${namespace}100`);
    }
    mcsd.acceptFlag(datimId, orgid, (err) => {
      winston.info('Done marking flag as a match');
      res.set('Access-Control-Allow-Origin', '*');
      if (err) res.status(401).send({ error: err });
      else res.status(200).send();
    });
  });
});

app.post('/noMatch/:orgid', (req, res) => {
  winston.info('Received data for matching');
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
    return;
  }
  const orgid = req.params.orgid;
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    let mohId = fields.mohId;
    const recoLevel = fields.recoLevel;
    const totalLevels = fields.totalLevels;
    if (!mohId) {
      winston.error({ error: 'Missing either MOHID' });
      res.set('Access-Control-Allow-Origin', '*');
      res.status(401).json({ error: 'Missing either MOHID' });
      return;
    }
    if (recoLevel == totalLevels) {
      const namespace = config.getConf('UUID:namespace');
      mohId = uuid5(mohId, `${namespace}100`);
    }
    mcsd.saveNoMatch(mohId, orgid, recoLevel, totalLevels, (err) => {
      winston.info('Done matching');
      res.set('Access-Control-Allow-Origin', '*');
      if (err) res.status(401).send({ error: err });
      else res.status(200).send();
    });
  });
});

app.post('/breakMatch/:orgid', (req, res) => {
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
    return;
  }
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    winston.info(`Received break match request for ${fields.datimId}`);
    const datimId = fields.datimId;
    const database = config.getConf('mapping:dbPrefix') + req.params.orgid;
    mcsd.breakMatch(datimId, database, (err) => {
      winston.info(`break match done for ${fields.datimId}`);
      res.set('Access-Control-Allow-Origin', '*');
      res.status(200).send(err);
    });
  });
});

app.post('/breakNoMatch/:orgid', (req, res) => {
  if (!req.params.orgid) {
    winston.error({ error: 'Missing Orgid' });
    res.set('Access-Control-Allow-Origin', '*');
    res.status(401).json({ error: 'Missing Orgid' });
    return;
  }
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    winston.info(`Received break no match request for ${fields.mohId}`);
    var mohId = fields.mohId;
    if (!mohId) {
    	winston.error({'error': 'Missing MOH ID'})
    	res.set('Access-Control-Allow-Origin', '*');
    	res.status(401).json({ error: 'Missing MOH ID' });
    	return
    }
    const recoLevel = fields.recoLevel;
    const totalLevels = fields.totalLevels;
    const database = config.getConf('mapping:dbPrefix') + req.params.orgid;
    if (recoLevel == totalLevels) {
      const namespace = config.getConf('UUID:namespace');
      mohId = uuid5(mohId, `${namespace}100`);
    }
    mcsd.breakNoMatch(mohId, database, (err) => {
      winston.info(`break no match done for ${fields.mohId}`);
      res.set('Access-Control-Allow-Origin', '*');
      res.status(200).send(err);
    });
  });
});

app.post('/uploadCSV', (req, res) => {
  const form = new formidable.IncomingForm();
  form.parse(req, (err, fields, files) => {
    winston.info(`Received MOH Data with fields Mapping ${JSON.stringify(fields)}`);
    if (!fields.orgid) {
      winston.error({ error: 'Missing Orgid' });
      res.set('Access-Control-Allow-Origin', '*');
      res.status(401).json({ error: 'Missing Orgid' });
      return;
    }
    const orgid = fields.orgid;
    const orgname = fields.orgname;
    const database = config.getConf('mCSD:database');
    const expectedLevels = config.getConf('levels');
    if (!Array.isArray(expectedLevels)) {
      winston.error('Invalid config data for key Levels ');
      res.set('Access-Control-Allow-Origin', '*');
      res.status(401).json({ error: 'Un expected error occured while processing this request' });
      res.end();
      return;
    }
    if (Object.keys(files).length == 0) {
      winston.error('No file submitted for reconciliation');
      res.status(401).json({ error: 'Please submit CSV file for facility reconciliation' });
      res.end();
      return;
    }
    const fileName = Object.keys(files)[0];
    winston.info('validating CSV File');
    validateCSV(fields, (valid, missing) => {
      if (!valid) {
        winston.error({ MissingHeaders: missing });
        res.set('Access-Control-Allow-Origin', '*');
        res.status(401).json({ MissingHeaders: missing });
        res.end();
        return;
      }
      winston.info('CSV File Passed Validation');
      winston.info('Converting CSV to mCSD');
      const convertedTomCSD = new Promise((resolve, reject) => {
        mcsd.CSVTomCSD(files[fileName].path, fields, orgid, (mcsdMOH) => {
          resolve(mcsdMOH);
        });
      });

      convertedTomCSD.then((mcsdMOH) => {
        winston.info('CSV Converted to mCSD');
        winston.info('Saving MOH CSV into database');
        mcsd.saveLocations(mcsdMOH, orgid, (err, body) => {
          winston.info('MOH mCSD Saved');
          res.set('Access-Control-Allow-Origin', '*');
          if (err) {
            res.status(400).send(err);
            return;
          }
          res.status(200).end();
        });
      }).catch((err) => {
        winston.error(err);
      });
    });
  });

  function validateCSV(cols, callback) {
    const missing = [];
    if (!cols.hasOwnProperty('facility') || cols.facility === null || cols.facility === undefined || cols.facility === false) {
      missing.push('facility');
    }
    if (!cols.hasOwnProperty('code') || cols.code === null || cols.code === undefined || cols.code === false) {
      missing.push('code');
    }
    if (!cols.hasOwnProperty('lat') || cols.lat === null || cols.lat === undefined || cols.lat === false) {
      missing.push('lat');
    }
    if (!cols.hasOwnProperty('long') || cols.long === null || cols.long === undefined || cols.long === false) {
      missing.push('long');
    }
    if (!cols.hasOwnProperty('level1') || cols.level1 === null || cols.level1 === undefined || cols.facility === false) {
      missing.push('level1');
    }
    if (!cols.hasOwnProperty('level2') || cols.level2 === null || cols.level2 === undefined || cols.level2 === false) {
      missing.push('level2');
    }
    if (!cols.hasOwnProperty('level3') || cols.level3 === null || cols.level3 === undefined || cols.level3 === false) {
      missing.push('level3');
    }
    if (!cols.hasOwnProperty('level4') || cols.level4 === null || cols.level4 === undefined || cols.level4 === false) {
      missing.push('level4');
    }
    if (missing.length > 0) {
      return callback(false, missing);
    } return callback(true, missing);
  }
});

const server = app.listen(config.getConf('server:port'));
winston.info(`Server is running and listening on port ${server.address().port}`);
