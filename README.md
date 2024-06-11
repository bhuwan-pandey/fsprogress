# fsprogress

fsprogress is a light-weight javascript (NodeJS) library to copy and move file(s), folder(s) along with method-call and event based progress tracking, managing concurrency of operation and a little more. There is no file/folder size limitation. Buffer for the operation is also handled natively for effectiveness

## Installation

Use the package manager **npm** to install.

```bash
npm install fsprogress
```

## Usage

```javascript
const { DaemonicProgress } = require("fsprogress");
const dp = new DaemonicProgress("fullSourcePath", "fullDestinationPath");
```

### Basic

```javascript
dp.on("progress", (theFileData, overallSize, theFiles) => {
  // listen to event for progress
  // put your logic here for the file's progress
}).start();
// or
dp.start();
dp.getProgress(); // method call to get progress
```

### Events

```javascript
// listening to events

// calculating
dp.on("calculating", (size) => {
  console.log("Calculating size:", size, "bytes"); // Calculating size: 12345 bytes
  // this event will emit untill the 'begin' event is emitted
  // do something when calculating size.
});

// begin
dp.on("begin", (totalSize) => {
  console.log(totalSize); // 123456789
  // do something when got notified that the operation has finally begun
});

// progress
dp.on("progress", (theFileData, overallSize, theFiles) => {
  // do something with these progress data, especially with this file's (theFileData) progress.
});

// finish
dp.on("finish", (theFileData, overallSize, theFiles) => {
  // do something with these progress data, especially with this file's (theFileData) data when the operation of this file is complete.
});

// done
dp.on("done", (theFileData, overallSize, theFiles) => {
  console.log(theFileData); // {}
  // do something with thses progress data when the overall operation of source(s) is compelete.
});

// error
dp.on("error", (theFileData, overallSize, theFiles) => {
  console.log(theFileData.error); // some error message describing the error
  // do something with these progress data, especially with this file's data (theFileData) which has error value in it.
});

// aborted
dp.on("aborted", (theFileData, overallSize, theFiles) => {
  // do something with these progress data, especially with this file(s) (theFileData) data which consist a list of the file(s) thats aborted.
});

// and at last, you can simply start your operation
dp.start();
```

### DaemonicOptions

```javascript
// you can also pass callback(s) for an event in an array for registering event listeners.
const callbackOptions = {
  callbacks: [
    {
      event: "progress",
      callback: (theFileData, overallSize, theFiles) => {
        // do something here with the progress data for each file.
      },
    },
  ],
};

// you can make your progress event be emitted in timely fashion.
// emit progress forEvery 1000 milliseconds
const callbackOptions = {
  eventTiming: { unit: "ms", value: 1000, forEvery: true },
};

// emit progress forEvery 1MB of data being processed
const callbackOptions = {
  eventTiming: { unit: "ms", value: 1048576, forEvery: true },
};

// emit progress forEvery 10 percent of data being processed
const callbackOptions = {
  eventTiming: { unit: "percent", value: 10, forEvery: true },
};

// emit progress only once for 50 percent of data being processed
const callbackOptions = {
  eventTiming: { unit: "percent", value: 50, forEvery: false },
};

// emit progress only once after 10 seconds when file operation has begun
const callbackOptions = {
  eventTiming: { unit: "ms", value: 10000, forEvery: false },
};

const dp = new DaemonicProgress(
  "yourSourcePath",
  "yourDestinationPath",
  callbackOptions
);
```

## Arguments \| Options

### Constructor Arguments

| Name        | Description                                   | Type                    | Default                                                                                                                                                                                           |
| ----------- | --------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| source      | full path name(s).                            | string \| Array<string> |                                                                                                                                                                                                   |
| destination | full directory name.                          | string                  |                                                                                                                                                                                                   |
| options     | options for setting the behavior of operation | daemonicOptions         | ` { log: false, resume: false, chunkSize: 4096, mode: 'copy', maxConcurrentOperation: 1, abortAllOnError: false, callbackOptions: { eventTiming: { unit: 'ms', value: 1000, forEvery: true } } }` |

### daemonicOptions?

| Property               | Description                                                                                                                               | Type                               | Default |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------- |
| log                    | Whether to log on to console about what's happening                                                                                       | boolean                            | `false` |
| resume                 | Whether to resume file from how much data it currently has. Having value false means overwriting the file                                 | boolean                            | `false` |
| chunkSize              | file's data size to read at a time for writing                                                                                            | number                             | `4096`  |
| mode                   | Mode of operation. Values can be either 'copy' or 'move'. In `size` mode, operation will terminate after calculating totalSize of src(s). | string: 'copy' \| 'move' \| 'size' | `copy`  |
| maxConcurrentOperation | Number of concurrent operation to process at a time. `0` indicates no limit.                                                              | number                             | `1`     |
| abortAllOnError        | Whether to abort complete operation (for all files) if an error occurs for any file.                                                      | boolean                            | `false` |
| callbackOptions        | Callback options for overall operation                                                                                                    | `callbackOptions`                  |         |

#### callbackOptions?

| Property    | Description                        | Type                | Default                                       |
| ----------- | ---------------------------------- | ------------------- | --------------------------------------------- |
| callbacks   | Callback item(s) for the operation | Array<callbackItem> |                                               |
| eventTiming | Callback item(s) for the operation | eventTimingObject   | `{ unit: 'ms', value: 1000, forEvery: true }` |

### callbackItem

| Property | Description                   | Type                 | Default |
| -------- | ----------------------------- | -------------------- | ------- |
| event    | Name of event to listen to.   | event                |         |
| callback | Callback function to execute. | `(callbackArgs)=>{}` |         |

### eventTimingObject?

| Property | Description                                                                                                                         | Type    | Default |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| unit     | Unit on which the progress event emission is based on. See unit list.                                                               | string  | `ms`    |
| value    | Value based on the **unit** for which the progress event will be emitted. It's like a timing.                                       | number  | `1000`  |
| forEvery | Whether the progress event should be emitted for every **value** as per **unit**. It will always be `true` for `calculating` event. | boolean | `true`  |

### callbackArgs

| Property    | Description                                                       | Type               | Default |
| ----------- | ----------------------------------------------------------------- | ------------------ | ------- |
| theFileData | Data about the status of the file for which the event is emitted. | theFileDataObject  |         |
| overallSize | Overall size data for the whole operation.                        | overallSizeData    |         |
| theFiles    | Data about the status of all the files of the source(s).          | Array<theFileData> |         |

### theFileData

| Property         | Description                                                 | Type   | Default |
| ---------------- | ----------------------------------------------------------- | ------ | ------- |
| file             | Name of the file (full pathname) for the event is based on. | string |         |
| totalBytesCopied | Total bytes processed for the file.                         | number |         |
| totalSize        | Total size of the file.                                     | number |         |
| startTime        | Start time of the file's operation.                         | Date   |         |
| endTime          | End time of the file's operaiton.                           | Date   |         |
| error?           | Error object for the file's operation if any.               | Error  |         |

### overallSize

| Property         | Description                                          | Type   | Default |
| ---------------- | ---------------------------------------------------- | ------ | ------- |
| totalBytesCopied | Total bytes processed for all the file(s)/source(s). | number |         |
| totalSize        | Total size of all the file(s)/source(s).             | number |         |

### events

| Event       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| calculating | This event will emit as per `eventTiming` options except for the `percent` unit. Also, `forEvery` will be ignored (`forEvery` will always be `true`) for this event. The listener of this event will be called by passing current calculated size for every `value` for `unit` configured in `eventTiming`. This event will not get emitted after `begin` event is emitted.                                                                                                                                                                             |
| begin       | This event will emit once the overall source(s) `totalSize` has been calculated. The listener of this event will be called by passing `totalSize` of all the source(s) as an argument. This event also indicates that the actual operation has now begun. You can also show some sort of message like 'Calculating total size...' to the user after calling `start()` and before this event is emitted, and then you can show actual progress of the operation once the operation has begun. Emission of this event will termiante `calculating` event. |
| progress    | This event will be emitted as per `eventTiming` option for an individual file. The listener of this event will be called by passing `callbackArgs`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| finish      | This event will be emitted whenever a file's operation has been completed successfully without an error. The listener of this event will be called by passing `callbackArgs`.                                                                                                                                                                                                                                                                                                                                                                           |
| done        | This event will be emitted when overall operation is complete with or without any error(s). i.e. of every source(s). The listener of this event will be called by passing `callbackArgs` where `theFileData` will be an empty object. If `mode` is 'move' for the `daemonicOptions`, deletion of overall source(s) will begin after this event has been emitted.                                                                                                                                                                                        |
| error       | This event will be emitted if any error occurs while processing a file. This indicates that the file's operation has been completed with an error. The listener of this event will be called by passing `callbackArgs`.                                                                                                                                                                                                                                                                                                                                 |
| abort       | This event **can** be emitted to abort operation for all or any specific file(s). While emitting this event, you could pass a string, Array<string> of full file pathname for aborting operation of the file(s) or pass nothing to abort all operations.                                                                                                                                                                                                                                                                                                |
| aborted     | This event will be emitted when operation for file(s) are aborted either internally or manually by the user via `abortOperation` method. The listener of this event will be called by passing `callbackArgs` where `theFileData` will be an **array** of file(s) specified by the user while manually aborting, or all file(s) if specified none or aborted internally.                                                                                                                                                                                 |

### units

| Value   | Description                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| ms      | Milliseconds for which the progress event should be emitted as per the `value` specified in `eventTiming` options. |
| bytes   | Bytes for which the progress event should be emitted as per the `value` specified in `eventTiming` options.        |
| percent | Percent for which the progress event should be emitted as per the `value` specified in `eventTiming` options.      |

## Methods

```javascript
const { DaemonicProgress } = new require("fsprogress");
const dp = new DaemonicProgress(yourSource, yourDestination, daemonicOptions);
```

- `start(): void`
  This method is called to start operation for the provided source(s). After calling this method, `begin` event will be emitted once calculation of total size of source(s) is done.

```javascript
dp.start();
```

- `abortOperation(file?: string | Array<string>): void`
  This method aborts operation (`copy` or `move`) for the file(s) given in argument, or for all the file(s)/source(s) of this operation.
  After all the operation has been aborted, `aborted` event will be emited where the listener of this event will be called by passing `callbackArgs` where `theFileData` will be an **array** of file(s) specified by the user while manually aborting, or all file(s) if specified none or aborted internally.

```javascript
// you can listen to the 'aborted' event
dp.on("aborted", (theFileData, overallSize, theFiles) => {
  console.log(theFileData); // ['fullFilePathname', ...]
  // do something
});
```

- `getOverallSizes(): overallSize`
  This method takes no argument and returns `overallSize` data. You can track progress of overall operation also via this method call.

```javascript
dp.getOverallSizes(); // { totalBytesCopied: 12345, totalSize: 123456789 }
```

- `getProgress(file?: string | null): { false | theFileData | Array<theFileData> }`
  If filename is passed as an argument, this method will return `theFileData` for the specified file if the file exists in the progress record, else `null`. If nothing is passed as an argument, this method will return an **array** of `theFileData` for each file/source.

- `getRegisteredOptions(): { src: Array<string>, dest: string, daemonicOptions }`
  This method returns `daemonicOptions` along with passed source(s) and destination as an object.

- `getFilesInOperation(): Array<string>`
  This method returns the file(s) concurrently in operation as an array.

- `eventNames(): events`
  This method takes no argument and returns an array of all the `event`.

```javascript
dp.eventNames(); //["begin", "progress", "finish", "done", "error", "abort", "aborted"]
```

## Static Method

- `getSizeOf(path: string): number`
  This method returns the total size of the specified pathname of argument if exist, else `0`.

- `sizify(size: number): [number, string]`
  This method returns the total size and unit closes to the matched unit, as an array.

```javascript
DaemonicProgress.sizify(12345); // [ 12.0556640625, 'KB' ]
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
