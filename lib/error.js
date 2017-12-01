const MultipartError = function (message, code) {
  this.message = message
  this.code = code || -1
  this.name = 'MultipartError'
  Error.captureStackTrace(this, MultipartError)
}

module.exports = {
  MultipartError: MultipartError
}