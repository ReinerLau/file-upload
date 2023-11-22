self.importScripts('/spark-md5.min.js')

self.onmessage = (e) => {
  const { fileChunkList } = e.data

  const spark = new self.SparkMD5.ArrayBuffer()

  let precentage = 0

  let count = 0

  const loadNext = (index) => {
    const reader = new FileReader()

    reader.readAsArrayBuffer(fileChunkList[index])

    reader.onload = (e) => {
      count++

      spark.append(e.target.result)

      if (count === fileChunkList.length) {
        self.postMessage({
          precentage: 100,
          hash: spark.end()
        })

        self.close()
      } else {
        precentage += 100 / fileChunkList.length

        self.postMessage({
          precentage
        })

        loadNext(count)
      }
    }
  }

  loadNext(0)
}
