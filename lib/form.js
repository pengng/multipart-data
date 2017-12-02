const EventEmitter = require('events')
const Parser = require('./parser')
const MultipartDataError = require('./error')

const Form = function (options) {
  if (!(this instanceof Form)) {
    return new Form(options)
  }
  EventEmitter.call(this)
  this.options = options || {}
}

const proto = Form.prototype = Object.create(EventEmitter.prototype, { constructor: Form })

proto.parse = function (req, callback) {
  const headers = req.headers || {}
  const contentType = this._getHeader(headers, 'content-type')
  const REG = /multipart\/form-data[\s\S]*boundary\s*=\s*([a-z_-]+)/i
  const matches = contentType.match(REG)
  if (!matches) {
    const err = new MultipartDataError('parse() http request header does not contain content-type')
    if (typeof callback === 'function') {
      callback(err)
    } else {
      this.emit('error', err)
    }
    return
  }
  const parser = new Parser(Object.assign({}, this.options, {
    boundary: matches[1],
    autoFiles: !!callback,
    autoFields: !!callback
  }))
  parser.on('finish', (function () {
    if (typeof callback === 'function') {
      return callback(null, parser.fields, parser.files)
    }
    this.emit('close')
  }).bind(this))
  parser.on('error', (function (err) {
    if (typeof callback === 'function') {
      return callback(err)
    }
    this.emit('error', err)
  }).bind(this))
  if (this.eventNames().indexOf('field') >= 0) {
    parser.on('field', this.emit.bind(this, 'field'))
  } else {
    this.on('newListener', function (eventName) {
      if (eventName === 'field') {
        parser.on('field', this.emit.bind(this, 'field'))
      }
    })
  }
  if (this.eventNames().indexOf('file') >= 0) {
    parser.on('file', this.emit.bind(this, 'file'))
  } else {
    this.on('newListener', function (eventName) {
      if (eventName === 'file') {
        parser.on('file', this.emit.bind(this, 'file'))
      }
    })
  }
  if (this.eventNames().indexOf('part') >= 0) {
    parser.on('part', this.emit.bind(this, 'part'))
  } else {
    this.on('newListener', function (eventName) {
      if (eventName === 'part') {
        parser.on('part', this.emit.bind(this, 'part'))
      }
    })
  }
  req.pipe(parser)
}

proto._getHeader = function (obj, keyName) {
  const reg = new RegExp(keyName, 'i')
  for (let key in obj) {
    if (reg.test(key)) {
      return obj[key]
    }
  }
}

module.exports = Form