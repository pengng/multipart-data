# multipart-data

Simple multipart/form-data parsing or building module

### Usage

```bash
npm i multipart-data -S
```

```javascript
const http = require('http')
const Form = require('multipart-data').Form

http.createServer(function (req, res) {
  if (req.method.toLowerCase() === 'post' && req.url === '/upload') {
    const form = new Form()
    form.parse(req, function (err, fields, files) {
      if (!err) {
        console.log(fields)
        console.log(files)
        res.end()
      }
    })
  } else {
    res.end()
  }
})
```

### new Form([options])

- `options` \<Object\>
  - `maxFieldsSize` \<number\> 当 `text` 类型的内容数据超出时触发 `error` 事件。单位：`byte`  ，默认 `2MB` 。
  - `maxFields` \<number\> 当 `text` 类型的字段数量超出时触发 `error` 事件。默认 `1000` 。
  - `maxFilesSize` \<number\> 当 `file` 类型的内容数据超出时触发 `error` 事件。单位：`byte` 。默认 `Infinity` 。
  - `uploadDir` \<string\> 文件上传保存目录。默认 `os.tmpdir()` 。

### Function

#### parse(req[, callback])

解析请求对象。

- `req` \<Incoming>
- `callback` \<Function\>
  - `err` \<Error\>
  - `fields` \<Object\> `text` 字段数据
  - `files` \<Object\> 文件数据

> 当提供 `callback` 时，数据会自动被处理，文件会自动保存到 `uploadDir` 中。当全部数据处理完毕时，会调用 `callback` ，当出现错误时也一样。

```javascript
const http = require('http')
const Form = require('multipart-data').Form

http.createServer(function (req, res) {
  if (req.method.toLowerCase() === 'post' && req.url === '/upload') {
    const form = new Form()
    form.parse(req, function (err, fields, files) {
      if (!err) {
        console.log(fields)
        console.log(files)
        res.end()
      }
    })
  } else {
    res.end()
  }
})
/**
print files
{
  "file": {
    "filename": "1.jpg",
    "size": 326603,
    "type": "image/jpeg",
    "path": "/var/folders/vs/kf0w144556g2gb4fr4j3v2xh0000gn/T/15122353640973214"
  },
  "file2": {
    "filename": "2.jpeg",
    "size": 98817,
    "type": "image/jpeg",
    "path": "/var/folders/vs/kf0w144556g2gb4fr4j3v2xh0000gn/T/15122353641153904"
  }
}
print fields
{
  "name": "xiaobai"
}
*/
```

### Event

#### error 

错误事件

- `err` \<Error\>

#### close

数据处理完成事件。

#### field

解析一个 `text` 字段时触发

- `field` \<Object\>
  - `name` \<string\> 字段名
  - `value` \<string\> 字段值

```javascript
form.on('field', function (field) {
  console.log(field)
  /**
  { name: 'age',
    value: '12' }
  */
})
```

#### file

解析一个文件时解发。

- `file` \<Object\>
  - `name` \<string\> 字段名
  - `filename` \<string\> 文件名
  - `size` \<number\> 文件体积。单位：`byte`
  - `type` \<string\> 文件类型。示例：`image/jpeg` 
  - `path` \<string\> 文件保存的绝对路径

```javascript
form.on('file', function (file) {
  console.log(file)
  /**
  { filename: '1.jpg',
    size: 326603,
    type: 'image/jpeg',
    path: '/var/folders/vs/kf0w144556g2gb4fr4j3v2xh0000gn/T/15122352606768469',
    name: 'file' }
  */
})
```

#### part

当解析数据一部分时触发。

- `part` \<Readable\> 当前部分的可读流。同时具备下列属性。
  - `isFile` \<boolean\> 是否文件
  - `name` \<string\> 字段名
  - `filename` \<string\> 文件名，仅当 `isFile` 为 `true` 时。
  - `type` \<string\> 文件类型，仅当 `isFile` 为 `true` 时。

> 当需要获取数据流时可以绑定 `part` 事件，流开始时是暂停状态，要绑定 `data` 事件或调用 `resume()` 方法或 `pipe()` 方法改变为流动状态。 

>当调用 `parse()` 方法时提供 `callback` 或绑定了 `field` 事件和 `file` 事件时，数据会自动被处理，因此 `part` 事件不会触发。

```javascript
const Form = require('multipart-data')
const http = require('http')

http.createServer(function (req, res) {
  if (req.method.toLowerCase() === 'post' && req.url === '/upload') {
    const form = new Form()
    form.on('part', function (part) {
      part.pipe(require('fs').createWriteStream(__dirname + '/' + part.filename))
    })
    form.on('field', function (field) {
      console.log(field)
    })
    form.on('close', function () {
      console.log('ok')
      res.end('ok')
    })
    form.parse(req)
  } else {
    res.end()
  }
}).listen(8000)
```

