import {Picker} from 'meteor/meteorhacks:picker';
import {Meteor} from 'meteor/meteor';
import {SlideDecks} from '/lib/collections';
import request from 'request';
import hat from 'hat';
import GithubAPI from 'github4';
import Promise from 'bluebird';

export function configureAPI() {
  Picker.route('/api/v1/slide_decks/:ownerName/:repoName/:prNumber', function (params, req, res) {
    let slideDeck = SlideDecks.findOne({
      ownerName: params.ownerName,
      repoName: params.repoName,
      prNumber: parseInt(params.prNumber, 10)
    });

    let response = JSON.stringify(slideDeck);
    res.end(response);
  });

  Picker.route('/api/v1/auth/github', function (params, req, res) {
    let redirectUri = Meteor.absoluteUrl('api/v1/auth/github/callback', {secure: true});
    let clientId = Meteor.settings.public.githubClientId;

    let oauthUrl =
      'https://github.com/login/oauth/authorize' +
      '?response_type=code' +
      `&redirect_uri=${redirectUri}` +
      '&scope=user:email,public_repo' +
      `&client_id=${clientId}`;

    res.writeHead(301, {Location: oauthUrl});
    res.end();
  });

  Picker.route('/api/v1/auth/github/callback', function (params, req, res) {
    console.log('code', params.query.code);
    let reqBody = {
      client_id: Meteor.settings.public.githubClientId,
      client_secret: Meteor.settings.githubClientSecret,
      code: params.query.code
    };

    request.post(
      {url: 'https://github.com/login/oauth/access_token', json: true, body: reqBody},
      Meteor.bindEnvironment(function (err, httpRes, body) {
        if (err) {
          return console.log(err);
        }


        let githubToken = body.access_token;
        let vymToken = hat();

        (async function () {
          let github = new GithubAPI({version: '3.0.0'});
          github.authenticate({
            type: 'oauth',
            token: githubToken
          });

          function getUserData() {
            return new Promise(function (resolve, reject) {
              github.users.get({}, function (err, res) {
                if (err) {
                  reject(err);
                } else {
                  resolve(res)
                }
              });
            });
          }

          function getUserEmails() {
            return new Promise(function (resolve, reject) {
              github.users.getEmails({}, function (err, res) {
                if (err) {
                  reject(err);
                } else {
                  resolve(res)
                }
              });
            });
          }

          let userData = await getUserData();
          let emails = await getUserEmails();

          let userDoc = {
            services: {
              github: {
                id: userData.id,
                accessToken: githubToken,
                username: userData.login,
                emails
              }
            },
            profile: {
              name: userData.name
            },
            vymToken
          };

          Meteor.users.upsert({'services.github.accessToken': githubToken}, {
            $set: userDoc
          });

          res.writeHead(301, {Location: `https://github.com?vymToken=${vymToken}`});
          res.end();
        }());

      })
    );
  });
}
