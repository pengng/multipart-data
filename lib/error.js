const MultipartDataError = function (message, code) {
  this.message = message
  this.code = code || -1
  this.name = 'MultipartDataError'
  Error.captureStackTrace(this, MultipartError)
}

module.exports = {
  MultipartDataError: MultipartDataError
}