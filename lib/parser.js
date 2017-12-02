const fs = require('fs')
const os = require('os')
const path = require('path')
const Writable = require('stream').Writable
const MultipartError = require('./error').MultipartError

const Parser = function (options) {
  if (!(this instanceof Parser)) {
    return new Parser(options)
  }
  Writable.call(this)
  this.files = {}
  this.fields = {}
  options = options || {}
  this.totalFieldsSize = 0
  this.totalFields = 0
  this.totalFilesSize = 0
  this.maxFieldsSize = options.maxFieldsSize || 1024 * 1024 * 2 // 2MB
  this.maxFields = options.maxFields || 1000
  this.maxFilesSize = options.maxFilesSize || Infinity
  this.uploadDir = options.uploadDir || os.tmpdir()
  this.init()
  this.boundary = new RegExp('--' + options.boundary + '(?:--)?')
}

const REG = /name\s*=\s*"\s*(\S+?)\s*"(.*?filename\s*=\s*"\s*(\S*)\s*")?/i
const REG2 = /content-type\s*:\s*([a-z-+]+\/[a-z-+]+)/i

const proto = Parser.prototype = Object.create(Writable.prototype, { constructor: Parser })

proto.init = function () {
  this.value = ''
  this.fieldName = ''
  this.file = null
  this.fileName = ''
  this.filePath = ''
  this.fileType = ''
  this.fileSize = 0
  this.lastLine = ''
  this.isFile = false
}

proto._write = function (chunk, encoding, callback) {
  let matches = null
  let start = 0
  const lines = chunk.toString('ascii').split('\r\n')
  for (let i = 0, len = lines.length; i < len; i++) {
    const line = lines[i]
    if (this.boundary.test(line)) {
      if (this.lastLine) {
        this.writeChunk(this.lastLine)
        this.lastLine = ''
      }
      this.endChunk(chunk.slice(start, lines.slice(0, i).join('\r\n').length))
    } else if (this.boundary.test(this.lastLine + line)) {
      this.endChunk(chunk.slice(start, lines.slice(0, i).join('\r\n').length))
    } else if (matches = line.match(REG)) {
      const name = matches[1]
      this.isFile = !!matches[2]
      const fileName = matches[3]
      let index = lines.slice(0, i).join('\r\n').length + 2 + line.indexOf(name)
      this.fieldName = chunk.slice(index, index + name.length).toString()
      if (fileName) {
        let index = lines.slice(0, i).join('\r\n').length + 2 + line.indexOf(fileName)
        this.fileName = chunk.slice(index, index + fileName.length).toString()
      }
    } else if (matches = line.match(REG2)) {
      this.fileType = matches[1]
    } else if (line === '') {
      start = lines.slice(0, i).join('\r\n').length + 4
      this.fileSize = 0
    }
  }
  if (this.lastLine) {
    this.writeChunk(this.lastLine)
    this.lastLine = ''
  }
  this.lastLine = chunk.slice(-lines.pop().length)
  this.writeChunk(chunk.slice(start, -this.lastLine.length))
  callback()
}

proto.set = function (obj, key, value) {
  if (obj[key] instanceof Array) {
    obj[key].push(value)
  } else if (obj[key]) {
    obj[key] = [obj[key], value]
  } else {
    obj[key] = value
  }
}

proto.writeChunk = function (chunk) {
  if (!chunk || chunk.length === 0) {
    return
  }
  if (this.totalFieldsSize >= this.maxFieldsSize) {
    return this.emit('error', new MultipartError('The volume of the fields exceeds the maximum limit'))
  }
  if (this.totalFilesSize >= this.maxFilesSize) {
    return this.emit('error', new MultipartError('The file size exceeds the maximum limit'))
  }
  if (this.totalFields >= this.maxFields) {
    return this.emit('error', new MultipartError('The number of fields exceeds the maximum limit'))
  }
  if (this.isFile) {
    if (!this.file) {
      this.filePath = this.generateFileName()
      this.file = fs.createWriteStream(this.filePath)
    }
    this.file.write(chunk)
    this.fileSize += chunk.length
    this.totalFilesSize += chunk.length
  } else {
    this.value += chunk
    this.totalFieldsSize += chunk.length
  }
}

proto.endChunk = function (chunk) {
  if (!chunk || chunk.length === 0) {
    return
  }
  this.writeChunk(chunk)
  if (this.isFile) {
    this.file.end()
    this.set(this.files, this.fieldName, {
      filename: this.fileName,
      size: this.fileSize,
      type: this.fileType,
      path: this.filePath
    })
  } else {
    this.set(this.fields, this.fieldName, this.value)
    this.totalFields++
  }
  this.init()
}

proto.generateFileName = function () {
  return path.resolve(this.uploadDir, Date.now() + '' + parseInt(Math.random() * 8999 + 1000))
}

module.exports = Parser