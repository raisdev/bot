// Description:
// Let's get some github pull request info
//
// Commands:
//   listens for github.com pull request urls like https://github.com/foo/foo-api/pull/975
//   listens for github.com issue urls like https://github.com/foo/foo-api/issues/815

'use strict'
var _ = require('lodash')
var Q = require('q')

function formatPr(pr, issue, status) {
    var attachment = {
        title: pr.title + ' #' + pr.number,
        title_link: pr.html_url,
        text: '*' + pr.user.login + '* wants to merge ' + pr.commits + ' commit' + (pr.commits !== 1 ? 's' : '') + ' into \`' + pr.base.ref + '\` from \`' + pr.head.ref + '\`',
        color: '#000000',
        fallback: pr.title + '#' + pr.number,
        author_name: pr.user.login,
        author_link: pr.user.html_url,
        author_icon: pr.user.avatar_url,
        mrkdwn_in: ['text', 'fields']
    }

    if (issue.labels.length) {
        attachment.fields = [{
            title: 'Labels',
            value: issue.labels.map(function(label) {
                return '`[' + label.name + ']`'
            }).join('\n'),
            short: true
        }]
    }

    var state = pr.state
    if (pr.state === 'closed') {
        if (pr.merged) {
            attachment.color = '#6E5497'
            state = 'merged'
        } else {
            attachment.color = '#BE2A00'
        }
    } else {
        if (!pr.mergeable) {
            state = 'Needs Rebase'
            attachment.color = '#888888'
        } else {
            if (status.length > 0 && status[0].state === 'pending') {
                state = 'Building'
                attachment.color = '#CEA600'
            } else if (status.length > 0 && (status[0].state === 'failure' || status[0].state === 'error')) {
                state = 'CI ' + _.capitalize(status[0].state)
                attachment.color = '#EE5B59'
            } else {
                attachment.color = '#6AC631'
            }
        }
    }

    attachment.text = '`[' + _.capitalize(state) + ']` ' + attachment.text

    return attachment
}

function formatIssue(issue, msg) {
    var attachment = {
        title: issue.title + ' #' + issue.number,
        title_link: issue.html_url,
        text: issue.body,
        color: '#000000',
        fallback: issue.title + '#' + issue.number,
        author_name: issue.user.login,
        author_link: issue.user.html_url,
        author_icon: issue.user.avatar_url,
        mrkdwn_in: ['text', 'fields']
    }

    if (issue.labels.length) {
        attachment.fields = [{
            title: 'Labels',
            value: issue.labels.map(function(label) {
                return '`[' + label.name + ']`'
            }).join('\n'),
            short: true
        }]
    }

    var state = issue.state
    if (issue.state === 'closed') {
        attachment.color = '#BE2A00'
    } else {
        attachment.color = '#6AC631'
    }
    attachment.text = '`[' + _.capitalize(state) + ']` ' + attachment.text

    return attachment
}

function getUrl(url, msg) {
    var apiToken = process.env.HUBOT_GITHUB_API_TOKEN
    var deferred = Q.defer()

    msg.http(url).header('Authorization', 'token ' + apiToken).get()(function(err, res, body) {
        if (err) {
            deferred.reject(err)
        }
        try {
            var data = JSON.parse(body)
            deferred.resolve(data)
        } catch (e) {
            deferred.reject(err)
        }
    })

    return deferred.promise
}

module.exports = function(robot) {
    robot.hear(/https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z0-9\-])+)\/pulls/gi, function(msg) {
        msg.send('PEOPLE. There are pull requests to review.')
    })

    robot.hear(/https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z\-])+)\/issues\/([\d]+)/gi, function(msg) {
        var urls = msg.message.text.match(/https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z\-])+)\/issues\/([\d]+)/gi)

        _.each(urls, function(url) {
            var matches = /https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z0-9\-])+)\/issues\/([\d]+)/gi.exec(url)
            var owner = matches[1]
            var project = matches[3]
            var issue = matches[5]
            var baseUrl = 'https://api.github.com/repos/' + owner + '/'

            var issueUrl = baseUrl + project + '/issues/' + issue

            getUrl(issueUrl, msg).then(function(issue) {
                robot.emit('slack.attachment', formatIssue(issue, msg))
            }).catch(function(error) {
                msg.send('There was an error fetching the issue.')
            })
        })
    })

    robot.hear(/https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z0-9\-])+)\/pull\/([\d]+)/gi, function(msg) {
        var urls = msg.message.text.match(/https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z\-])+)\/pull\/([\d]+)/gi)
        _.each(urls, function(url) {
            var matches = /https\:\/\/(?:www\.)?github\.com\/(([A-Za-z0-9\-])+)\/(([A-Za-z0-9\-])+)\/pull\/([\d]+)/gi.exec(url)
            var owner = matches[1]
            var project = matches[3]
            var pull = matches[5]
            var baseUrl = 'https://api.github.com/repos/' + owner + '/'

            var pullRequestUrl = baseUrl + project + '/pulls/' + pull
            var issueUrl = baseUrl + project + '/issues/' + pull

            Q.all([
                getUrl(pullRequestUrl, msg),
                getUrl(issueUrl, msg)
            ]).then(function(data) {
                var pr = data[0]
                var issue = data[1]
                var statusUrl = pr.statuses_url
                return Q.all([
                    pr,
                    issue,
                    getUrl(statusUrl, msg)
                ])
            }).then(function(data) {
                var pr = data[0]
                var issue = data[1]
                var status = data[2]

                msg.send({
                    attachments: [formatPr(pr, issue, status)]
                })
            }).catch(function(error) {
                msg.send('There was an error fetching the pull request.')
            })
        })
    })
}
