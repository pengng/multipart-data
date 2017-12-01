const fs = require('fs')
const os = require('os')
const Writable = require('stream').Writable

const Parser = function (options) {
  if (!(this instanceof Parser)) {
    return new Parser(options)
  }
  Writable.call(this)
  options = options || {}
  this.init()
  this.form = {
    text: {},
    file: {}
  }
  this.boundary = new RegExp('--' + options.boundary + '(?:--)?')
}

const REG = /name\s*=\s*"\s*(\S+?)\s*"(?:.*?filename\s*=\s*"\s*(\S+?)\s*")?/i
const REG2 = /content-type\s*:\s*(\w+\/\w+)/i

const proto = Parser.prototype = Object.create(Writable.prototype, { constructor: Parser })

proto.init = function () {
  this.value = ''
  this.name = ''
  this.file = null
  this.fileName = ''
  this.filePath = ''
  this.fileType = ''
  this.contentStart = 0
  this.contentLength = 0
  this.lastLine = 0
}

proto._write = function (chunk, encoding, callback) {
  let matches = null
  const lines = chunk.toString('ascii').split('\r\n')
  this.contentStart = 0
  for (let i = 0, len = lines.length; i < len; i++) {
    if (this.boundary.test(lines[i])) {
      if (this.lastLine) {
        this.fileSize += this.lastLine.length
        this.writeFile(this.lastLine)
        this.lastLine = ''
      }
      const preWrite = chunk.slice(this.contentStart, lines.slice(0, i).join('\r\n').length)
      this.endChunk(preWrite)
      this.fileSize += preWrite.length
    } else if (this.boundary.test(this.lastLine + lines[i])) {
      const preWrite = chunk.slice(this.contentStart, lines.slice(0, i).join('\r\n').length)
      this.endChunk(preWrite)
      this.fileSize += preWrite.length
    } else if (matches = lines[i].match(REG)) {
      let start = lines.slice(0, i).join('\r\n').length + 2 + lines[i].indexOf(matches[1])
      this.name = chunk.slice(start, start + matches[1].length).toString()
      if (matches[2]) {
        start = lines.slice(0, i).join('\r\n').length + 2 + lines[i].indexOf(matches[2])
        this.fileName = chunk.slice(start, start + matches[2].length).toString()
      }
    } else if (matches = lines[i].match(REG2)) {
      this.fileType = matches[1]
    } else if (lines[i] === '') {
      this.contentStart = lines.slice(0, i).join('\r\n').length + 4
      this.fileSize = 0
    }
  }
  if (this.lastLine) {
    this.fileSize += this.lastLine.length
    this.writeFile(this.lastLine)
    this.lastLine = ''
  }
  this.lastLine = chunk.slice(-lines[lines.length - 1].length)
  const preWrite = chunk.slice(this.contentStart, -this.lastLine.length)
  this.writeFile(preWrite)
  this.fileSize += preWrite.length
  callback()
}

proto.set = function (obj, key, value) {
  const form = obj
  if (form[key] instanceof Array) {
    form[key].push(value)
  } else if (form[key]) {
    form[key] = [form[key], value]
  } else {
    form[key] = value
  }
}

proto.writeFile = function (chunk) {
  if (!this.fileType) {
    this.value += chunk
  } else {
    if (!this.file) {
      this.filePath = this.generateFileName()
      this.file = fs.createWriteStream(this.filePath)
    }
    this.file.write(chunk)
  }
}

proto.endChunk = function (chunk) {
  if (!chunk || chunk.length === 0) {
    return
  }
  if (!this.fileType) {
    this.set(this.form.text, this.name, this.value + chunk)
  } else {
    this.file.end(chunk)
    this.set(this.form.file, this.name, {
      filename: this.fileName,
      size: this.fileSize,
      type: this.fileType,
      path: this.filePath
    })
  }
  this.file = null
  this.value = ''
  this.fileName = ''
  this.size = 0
  this.fileType = ''
  this.filePath = ''
}

proto.generateFileName = function () {
  return os.tmpdir() + '/' + Date.now() + parseInt(Math.random() * 8999 + 1000)
}

module.exports = Parser