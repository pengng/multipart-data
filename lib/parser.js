const fs = require('fs')
const os = require('os')
const path = require('path')
const stream = require('stream')
const Writable = stream.Writable
const Transform = stream.Transform
const MultipartDataError = require('./error').MultipartDataError

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
  this.autoFields = typeof options.autoFields === 'boolean' ? options.autoFields : false
  this.autoFiles = typeof options.autoFiles === 'boolean' ? options.autoFiles : false
  this.init()
  this.boundary = new RegExp('--' + options.boundary + '(?:--)?')
  this.on('newListener', (function (eventName) {
    if (eventName === 'field') {
      this.autoFields = true
    } else if (eventName === 'file') {
      this.autoFiles = true
    }
  }).bind(this))
}

const REG = /name\s*=\s*"\s*(\S+?)\s*"(.*?filename\s*=\s*"\s*([\S\s]*)\s*")?/i
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
  this.filePart = null
  this.fieldPart = null
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
    return this.emit('error', new MultipartDataError('The volume of the fields exceeds the maximum limit'))
  }
  if (this.totalFilesSize >= this.maxFilesSize) {
    return this.emit('error', new MultipartDataError('The file size exceeds the maximum limit'))
  }
  if (this.totalFields >= this.maxFields) {
    return this.emit('error', new MultipartDataError('The number of fields exceeds the maximum limit'))
  }
  if (this.isFile) {
    this.writeFile(chunk)
  } else {
    this.writeField(chunk)
  }
}

proto.writeFile = function (chunk) {
  if (this.autoFiles) {
    if (!this.file) {
      this.filePath = this.generateFileName()
      this.file = fs.createWriteStream(this.filePath)
    }
    this.file.write(chunk)
    this.fileSize += chunk.length
  } else {
    if (!this.filePart) {
      this.filePart = new Transform({
        transform: function (chunk, encoding, callback) {
          this.push(chunk)
          callback()
        }
      })
      this.emit('part', Object.assign(this.filePart, {
        isFile: true,
        name: this.fieldName,
        filename: this.fileName,
        type: this.fileType
      }))
    }
    this.filePart.write(chunk)
  }
  this.totalFilesSize += chunk.length
}

proto.writeField = function (chunk) {
  if (this.autoFields) {
    this.value += chunk
    this.totalFieldsSize += chunk.length
  } else {
    if (!this.fieldPart) {
      this.fieldPart = new Transform({
        transform: function (chunk, encoding, callback) {
          this.push(chunk)
          callback()
        }
      })
      this.emit('part', Object.assign(this.fieldPart, {
        isFile: false,
        name: this.fieldName
      }))
    }
    this.fieldPart.write(chunk)
  }
}

proto.endChunk = function (chunk) {
  if (!chunk || chunk.length === 0) {
    return
  }
  this.writeChunk(chunk)
  if (this.isFile) {
    this.endFilePart()
  } else {
    this.endFieldPart()
  }
  this.init()
}

proto.endFilePart = function () {
  if (this.autoFiles) {
    this.file.end()
    const obj = {
      filename: this.fileName,
      size: this.fileSize,
      type: this.fileType,
      path: this.filePath
    }
    this.set(this.files, this.fieldName, obj)
    this.emit('file', Object.assign({}, obj, { name: this.fieldName }))
  } else {
    this.filePart.end()
  }
}

proto.endFieldPart = function () {
  if (this.autoFields) {
    this.set(this.fields, this.fieldName, this.value)
    this.totalFields++
    this.emit('field', {
      name: this.fieldName,
      value: this.value
    })
  } else {
    this.fieldPart.end()
  }
}

proto.generateFileName = function () {
  return path.resolve(this.uploadDir, Date.now() + '' + parseInt(Math.random() * 8999 + 1000))
}

module.exports = Parser