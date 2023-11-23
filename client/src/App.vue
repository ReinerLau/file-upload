<script setup lang="ts">
import SparkMD5 from 'spark-md5'
import { computed, ref, type Ref } from 'vue'

/**
 * 当前上传的文件
 */
let currentFile: File

/**
 * 当前上传的文件 hash
 */
let currentFileHash: string

interface Chunk {
  chunk: Blob
  chunkHash: string
  precentage: number
  fileHash: string
  index: number
}

/**
 * 所有切片信息
 */
let data: Ref<Chunk[]> = ref([])

/**
 * 每个切片的大小
 */
const CHUNK_SIZE = 10 * 1024 * 1024

/**
 * hash 计算进度
 */
const hashPrecentage = ref(0)

/**
 * 切换上传文件
 * @param e 事件对象
 */
const handleFileChange = (e: any) => {
  const file = e.target.files[0]
  if (file) {
    currentFile = file
    data.value.length = 0
    hashPrecentage.value = 0
  }
}

/**
 * 正在上传的请求
 */
const requestList: XMLHttpRequest[] = []

/**
 * 封装请求方法
 * @param options 请求选项
 * @param options.url 请求路径
 * @param options.method 请求方法
 * @param options.data 请求数据
 * @param options.headers 请求头
 */
const request = ({
  url,
  method = 'post',
  data,
  headers = {},
  onProgress = () => null
}: {
  url: string
  method?: string
  data: any
  headers?: Record<string, any>
  onProgress?: (e: ProgressEvent<EventTarget>) => any
}) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = onProgress
    xhr.open(method, url)
    Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]))
    xhr.send(data)
    xhr.onload = (e: any) => {
      if (requestList) {
        const xhrIndex = requestList.findIndex((item) => item === xhr)
        requestList.splice(xhrIndex, 1)
      }

      if (e.target.status === 200) {
        resolve({
          data: e.target.response
        })
      } else {
        reject()
      }
    }
    requestList.push(xhr)
  })
}

/**
 * 暂停上传
 */
const handlePause = () => {
  requestList.forEach((xhr) => xhr.abort())
  requestList.length = 0
}

/**
 * 上传文件
 */
const handleUpload = async () => {
  if (currentFile) {
    const fileChunkList = createFileChunk(currentFile)
    currentFileHash = await calculateHash(currentFile)
    const { shouldUpload, uploadedList } = await verifyUpload(currentFile.name, currentFileHash)
    if (shouldUpload) {
      data.value = fileChunkList.map((file, index) => ({
        chunk: file,
        chunkHash: currentFileHash + '-' + index,
        precentage: uploadedList.includes(currentFileHash + '-' + index) ? 100 : 0,
        fileHash: currentFileHash,
        index
      }))
      await uploadChunks(uploadedList)
    } else {
      alert('跳过')
    }
  }
}

/**
 * 恢复上传
 */
const handleResume = async () => {
  const { shouldUpload, uploadedList } = await verifyUpload(currentFile.name, currentFileHash)
  if (shouldUpload) {
    await uploadChunks(uploadedList)
  } else {
    alert('跳过')
  }
}

/**
 * 校验服务器是否已经存在文件
 * @param fileName 文件名
 * @param fileHash 文件 hash
 */
const verifyUpload = async (fileName: string, fileHash: string): Promise<Record<string, any>> => {
  const res: any = await request({
    url: 'http://localhost:3000/verify',
    headers: {
      'content-type': 'application/json'
    },
    data: JSON.stringify({
      fileName,
      fileHash
    })
  })
  return JSON.parse(res.data)
}

/**
 * 计算 hash
 * @param fileChunkList 切片列表
 */
const calculateHash = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const spark = new SparkMD5.ArrayBuffer()

    const appendToSpark = async (file: Blob) => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.readAsArrayBuffer(file)
        reader.onload = (e) => {
          if (e.target && e.target.result instanceof ArrayBuffer) {
            spark.append(e.target.result)
          }
          resolve(true)
        }
      })
    }

    let count = 0

    const workLoop = async (deadline: IdleDeadline) => {
      while (count < chunks.length && deadline.timeRemaining() > 0) {
        await appendToSpark(chunks[count])

        hashPrecentage.value = Math.ceil(((count + 1) / chunks.length) * 100)

        count++
      }

      if (count === chunks.length) {
        resolve(spark.end())
      } else {
        requestIdleCallback(workLoop)
      }
    }

    const offset = 2 * 1024 * 1024

    let chunks = [file.slice(0, offset)]

    let cur = offset

    const getSampleLoop = (deadline: IdleDeadline) => {
      while (cur < file.size && deadline.timeRemaining() > 0) {
        if (cur + offset >= file.size) {
          chunks.push(file.slice(cur, cur + offset))
        } else {
          const mid = cur + offset / 2
          const end = cur + offset

          chunks.push(file.slice(cur, cur + 2))
          chunks.push(file.slice(mid, mid + 2))
          chunks.push(file.slice(end - 2, end))
        }

        cur += offset
      }

      if (cur < file.size) {
        requestIdleCallback(getSampleLoop)
      } else {
        requestIdleCallback(workLoop)
      }
    }

    requestIdleCallback(getSampleLoop)
  })
}

/**
 * 将文件拆分成多个切片
 * @param file 上传的文件对象
 * @param size 每个切片的大小
 */
const createFileChunk = (file: File, size = CHUNK_SIZE) => {
  const fileChunkList: Blob[] = []
  let cur = 0
  while (cur < file.size) {
    fileChunkList.push(file.slice(cur, cur + size))
    cur += size
  }
  return fileChunkList
}

/**
 * 上传切片
 */
const uploadChunks = async (uploadedList: string[] = []) => {
  const forms = data.value
    .filter((item) => {
      return !uploadedList.includes(item.chunkHash)
    })
    .map((item) => {
      const formData = new FormData()
      formData.append('chunk', item.chunk)
      formData.append('chunkHash', item.chunkHash)
      formData.append('filename', currentFile.name)
      formData.append('fileHash', item.fileHash)
      return {
        formData,
        index: item.index,
        status: Status.WAIT
      }
    })

  try {
    await sendRequest(forms, 2)
    mergeRequest()
  } catch (error) {
    console.error(error)
  }
}

/**
 * 切片上传状态映射
 */
const Status = {
  WAIT: 0,
  UPLOADING: 1,
  DONE: 2,
  ERROR: 3,
  OUT: 4
}

let retryArr: number[]

/**
 * 控制并发请求数量
 * @param forms 提交数据列表
 * @param max 最大请求数量
 */
const sendRequest = (forms: { formData: FormData; index: number; status: number }[], max = 4) => {
  retryArr = new Array(forms.length).fill(0)

  return new Promise((resolve, reject) => {
    let cur = max
    let counter = 0
    const start = () => {
      while (counter < forms.length && cur > 0) {
        const idx = forms.findIndex(
          (item) => item.status === Status.WAIT || item.status === Status.ERROR
        )
        // 表示只剩下正在上传的切片停止循环
        if (idx === -1) break
        const formData = forms[idx].formData
        const index = forms[idx].index
        request({
          url: 'http://localhost:3000',
          data: formData,
          onProgress: createProgressHandler(data.value[index])
        })
          .then(() => {
            cur++
            counter++
            forms[idx].status = Status.DONE
            if (counter === forms.length) {
              resolve(true)
            } else {
              start()
            }
          })
          .catch(() => {
            cur++
            data.value[index].precentage = 0
            retryArr[index] += 1
            if (retryArr[index] >= 2) {
              reject(index)
              forms[idx].status = Status.OUT
            } else {
              forms[idx].status = Status.ERROR
            }
            start()
          })
        cur--
        forms[idx].status = Status.UPLOADING
      }
    }
    start()
  })
}

/**
 * 每个切片生成对应的进度事件
 * @param item 每个切片
 */
const createProgressHandler = (item: Chunk) => {
  return (e: ProgressEvent<EventTarget>) => {
    item.precentage = parseInt(String((e.loaded / e.total) * 100))
  }
}

/**
 * 合并文件请求
 */
const mergeRequest = async () => {
  await request({
    url: 'http://localhost:3000/merge',
    headers: {
      'content-type': 'application/json'
    },
    data: JSON.stringify({
      filename: currentFile.name,
      chunkSize: CHUNK_SIZE,
      fileHash: currentFileHash
    })
  })
}

/**
 * 总进度条
 */
const uploadPrecentage = computed(() => {
  if (data.value.length === 0) return 0
  const loaded = data.value
    .map((item) => item.chunk.size * (item.precentage / 100))
    .reduce((acc, cur) => acc + cur)
  return Math.ceil((loaded / currentFile.size) * 100)
})
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" />
    <input type="button" value="upload" @click="handleUpload" />
    <input type="button" value="pause" @click="handlePause" />
    <input type="button" value="resume" @click="handleResume" />
    <input type="text" value="" />
    <div>
      <span>hash 进度: </span>
      <progress :value="hashPrecentage" :max="100"></progress>
    </div>
    <div>
      <span>总进度: </span>
      <progress :value="uploadPrecentage" :max="100"></progress>
    </div>
    <div v-for="item in data" :key="item.chunkHash">
      <span>{{ item.chunkHash }}: </span>
      <progress :value="item.precentage" :max="100"></progress>
    </div>
  </div>
</template>

<style scoped></style>
