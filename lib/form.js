const EventEmitter = require('events')
const Parser = require('./parser')

const Form = function (options) {
  if (!(this instanceof Form)) {
    return new Form(options)
  }
  EventEmitter.call(this)
  options = options || {}
}

const proto = Form.prototype = Object.create(EventEmitter.prototype, { constructor: Form })

proto.parse = function (req, callback) {
  const headers = req.headers || {}
  const contentType = this._getHeader(headers, 'content-type')
  const REG = /multipart\/form-data[\s\S]*boundary\s*=\s*([a-z_-]+)/i
  const matches = contentType.match(REG)
  if (!matches) {
    return callback()
  }
  const parser = new Parser({ boundary: matches[1] })
  parser.on('finish', function () {
    callback(parser.fields, parser.files)
  })
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