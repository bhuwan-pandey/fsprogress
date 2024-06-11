/**
 * This thing enables you to copy or move your file(s) or folder(s)
 * to one or more destination folder(s) along with method call
 * and event based progress tracking, aborting operation(s) and
 * little more.
 * @module DaemonicProgress
 * @author Daemon
 */

const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");

/**
 * @example new DaemonicProgress("source\\directory or file",
 * "destination\\folder").start({ log: true, resume: true });
 * @example new DaemonicProgress("source\\directory or file",
 * "destination\\folder")
 * .on('calculating', size => {
 * // put your logic here while calculating overall totalSize
 * }).on('begin', overallTotalSize => {
 * // put your logic here after calculating overall totalSize
 * }).on('progress', (theFileData, overallSize, theFiles) => {
 * // put your logic here for the file's progress
 * }).on('finish', (theFileData, overallSize, theFiles) => {
 * // put your logic here for the file's completion
 * }).on('done',(theFileData,  overall, theFiles) => {
 * // put your logic here for overall completion
 * }).on('error', (theFileData, overallSize, theFiles) => {
 * // put your logic here for the file's abortion
 * }).on('aborted', (theFileData, overallSize, theFiles) => {
 * // put your logic here for the file's abortion
 * }).start()
 * */
class DaemonicProgress extends EventEmitter {
  /**@private @type {Array<string>} */
  events = [
    "calculating",
    "begin",
    "progress",
    "finish",
    "done",
    "error",
    "abort",
    "aborted",
  ];
  /**@private @type {Array<string>} */
  units = ["ms", "percent", "bytes"];
  /**
   * @private
   * @type {Array<string>}
   * name of src file that is currently being processed.
   */
  filesInOperation = [];
  /**@private @type {string | Array<string>} */
  src = null;
  /**@private @type {string} */
  dest = null;
  /**
   * @private
   * @type {object}
   */
  files = {};
  /**
   * @private
   * list of commands(creating directory, copying file(s), logging
   * message) to execute after calculating overall totalSize
   * of source(s).
   * This approach is used to avoid creating directory in advanced
   * while calculating totalSizes, and for concurrency management
   * purpose.
   */
  commands = [];
  /**@private @type {number} */
  totalBytesCopied = 0;
  /**@private @type {number} */
  totalSize = 0;
  /**
   * @private
   */
  abortOperations = false;
  /**
   * @private
   * @type { { log: boolean, resume: boolean, chunkSize: number,
   * mode: 'copy' | 'move' | 'size', abortAllOnError: boolean,
   * maxConcurrentOperation: number, callbackOptions: { callbacks:
   * Array<{ event: 'progress' | 'finish' | 'done' | 'error',
   * callback: ( overallSize: { totalBytesCopied: number,
   * totalSize: number }, files: [ { file: string,
   * totalBytesCopied: number, totalSize: number, startTime: Date,
   * endTime: Date, error: Error } ] ) =>{} }>, eventTiming:
   * { value: number, unit: 'ms' | 'percent' | 'bytes',
   * forEvery: boolean } } } }
   */
  options = null;

  /**
   * @constructor
   * @param {string | Array<string>} src source file(s) or folder(s) to copy.
   * @param {string} dest destination folder to copy to.
   * @param { { log?: boolean, resume?: boolean, chunkSize?: number,
   * mode?: 'copy' | 'move' | 'size', maxConcurrentOperation?: number,
   * abortAllOnError?: boolean, callbackOptions?: { callbacks:
   * Array<{ event: 'calculating' | 'begin' | 'progress' | 'finish'
   * | 'done' | 'error',
   * callback: ( overallSize: { totalBytesCopied: number, totalSize: number },
   * files: [ { file: string, totalBytesCopied: number, totalSize: number,
   * startTime: Date, endTime: Date, error?: Error } ] ) =>{} }>,
   * eventTiming?: { value: number, unit?: 'ms' | 'percent' | 'bytes',
   * forEvery?: boolean } } } } options options for action.
   */
  constructor(
    src,
    dest,
    options = {
      log: false,
      resume: false,
      chunkSize: 4096,
      mode: "copy",
      maxConcurrentOperation: 1,
      abortAllOnError: false,
    }
  ) {
    super();
    // validate things.
    if (!src)
      throw new Error(
        "Source cannot be null! Please provide a valid source path!"
      );
    if (typeof src === "string") this.src = [src];
    else if (typeof src === "object" && src.length) this.src = src;
    else
      throw new Error(
        "Source error! Length of source is 0 or invalid source type!"
      );
    /**
     * trim leading '\\' for every source.
     * using index variable in map below as src just to avoid
     * creating a temporary variable. :D
     */
    this.src = this.src.map((source, src) => {
      src = [];
      for (let item of source.split("\\")) if (item) src.push(item);
      return src.join("\\");
    });
    if (!dest || typeof dest !== "string")
      throw new Error(
        "Destination error! Length of destination is 0 or invalid destination type!"
      );
    if (!fs.existsSync(dest))
      throw new Error("Destination: '" + dest + "' not found!");
    // trim leading '\\' for dest
    this.dest = []; // temporary hold of dest data
    for (let item of dest.split("\\")) if (item) this.dest.push(item);
    this.dest = this.dest.join("\\");
    options = {
      log: false,
      resume: false,
      chunkSize: 4096,
      mode: "copy",
      maxConcurrentOperation: 1,
      abortAllOnError: false,
      ...options,
    };
    if (
      options.mode !== "copy" &&
      options.mode !== "move" &&
      options.mode !== "size"
    )
      options.mode = "copy";
    if (!options.callbackOptions || typeof options.callbackOptions !== "object")
      options.callbackOptions = {};
    if (
      !options.callbackOptions.callbacks ||
      typeof options.callbackOptions.callbacks !== "object"
    )
      options.callbackOptions.callbacks = [];
    if (
      !options.callbackOptions.eventTiming ||
      typeof options.callbackOptions.eventTiming !== "object"
    ) {
      /**
       * initialize timing properties if not exist because
       * its needed for callback existence.
       * one can manually listen to events from object.
       * so preserving eventTiming is mandatory.
       */
      options.callbackOptions.eventTiming = {
        value: 1000,
        unit: "ms",
        forEvery: true,
      };
    } else {
      // validate eventTiming if exists
      options.callbackOptions.eventTiming.value =
        Number(options.callbackOptions.eventTiming.value) || 1000;
      options.callbackOptions.eventTiming.unit =
        this.units.indexOf(options.callbackOptions.eventTiming.unit) !== -1
          ? options.callbackOptions.eventTiming.unit
          : "ms";
      options.callbackOptions.eventTiming.forEvery =
        options.callbackOptions.eventTiming.forEvery === true ||
        options.callbackOptions.eventTiming.forEvery === false
          ? options.callbackOptions.eventTiming.forEvery
          : true;
    }
    this.options = options;
    this.options.callbackOptions.callbacks.map((back) => {
      if (
        this.events.indexOf(back.event) !== -1 &&
        typeof back.callback === "function"
      )
        this.on(back.event, (overall, files) =>
          this.options.callbackOptions.callbacks(overall, files)
        );
    });
    // listen for begin to clear interval for 'calculating' event
    this.on("begin", () =>
      clearInterval(
        this.files[this.src[0]] ? this.files[this.src[0]].intervalID : null
      )
    );
    /**
     * donot register default events other than 'begin'
     * if mode is 'size'. 'begin' event is common for all
     * modes so it is registered before this mode check.
     */
    if (options.mode === "size") return;
    /**
     * begin internal event registration to listen for performing
     * actions accordingly.
     */
    // calculate if all files are processed for every 'finish'.
    this.on("finish", (theFileData) => {
      let operationList = []; // temporary list of currentOperation
      // remove this file from filesInOperation list
      this.filesInOperation.map((file) =>
        file !== theFileData.file ? operationList.push(file) : null
      );
      this.filesInOperation = operationList;
      // clear interval for every file finish
      clearInterval(this.files[theFileData.file].intervalID);
      /**
       * calculate all aborted/error(ed) file(s) totalSize to
       * check if all the files are process or not.
       * because if any file(s) are aborted, then the 'done'
       * event will never be emitted resulting in execute()'ing
       * infinitely even if no operation is in process.
       */
      let abortedFilesSize = 0;
      for (let file in this.files)
        if (this.files[file] && this.files[file].error)
          abortedFilesSize += this.files[file].totalSize || 0;
      if (
        this.totalSize &&
        (this.totalSize <= this.totalBytesCopied ||
          this.totalSize <= this.totalBytesCopied + abortedFilesSize)
      )
        // all files are processed with or without error
        this.emit(
          "done",
          {},
          {
            totalBytesCopied: this.totalBytesCopied,
            totalSize: this.totalSize,
          },
          Object.keys(this.files).map((file) => ({
            file: file,
            totalBytesCopied: this.files[file].totalBytesCopied,
            totalSize: this.files[file].totalSize,
            startTime: this.files[file].startTime,
            endTime: this.files[file].endTime,
            error: this.files[file].error,
          }))
        );
      this.execute();
    });
    /**
     * 'done' event will be emitted only if there are no any
     * operation left to process. this means that all the files
     * are processed with or without errors.
     * clean things up and do the final task on this event.
     */
    this.on("done", () => {
      if (this.options.log) console.log("All files copied !!!");
      /**
       * clear filesInOperation and commands list to prevent
       * execute()'ing infinitely because for each finished process,
       * there will be undefined empty item in that index after the
       * file record has been deleted from the command list in 'finish'
       * event.
       * so it is necessary to completely empty these list so that
       * there will be no further item(even the undefined/empty item)
       * in the list to iterate on.
       */
      this.filesInOperation = [];
      this.commands = [];
      // remove src(s) if mode is 'move'
      if (this.options.mode === "move")
        for (let path of this.src)
          try {
            fs.rmSync(path, { recursive: true, force: true });
          } catch (err) {
            if (this.options.log)
              console.log(
                "Aborted deletion :: '" + src + "' with error ::",
                err.message || err
              );
          }
    });
    // listen for abortion
    this.on("abort", (file = null) => this.abortOperation(file));
    // listen for an error to abort all operation if flag is true
    this.on("error", () =>
      /**
       * 'aborted' event will not be emitted if the abortion
       * is done through here and abortAllOnError is false.
       */
      this.options.abortAllOnError ? this.abortOperation() : null
    );
  }

  eventNames = () => this.events;

  /**
   * @param {'calculating' | 'begin' | 'progress' | 'finish' | 'done' | 'error' | 'abort' | 'aborted'} event
   * @param {(...args)=>{}} listener
   */
  on(event, listener) {
    super.on(event, listener);
    return this;
  }

  /**
   * @param {'calculating' | 'begin' | 'progress' | 'finish' | 'done' | 'error' | 'abort' | 'aborted'} event
   * @param {(...args)=>{}} listener
   */
  once(event, listener) {
    super.once(event, listener);
    return this;
  }

  /**
   * @param {'calculating' | 'begin' | 'progress' | 'finish' | 'done' | 'error' | 'abort' | 'aborted'} event
   * @param {any[]} args
   */
  emit(event, ...args) {
    super.emit(event, ...args);
    return this;
  }

  /**
   * @method
   * starts the operation
   */
  start = async () => {
    /**
     * emit 'calculating' event as per the eventTiming
     * configuration.
     *
     * timing unit 'percent' wont be applicable for this event
     * since the totalSize is being calculated.
     *
     * timing option 'forEvery=false' wont be applicable for this
     * event. this event will emit forEvery 'bytes' | 'ms'
     * copied
     */
    if (this.options.callbackOptions.eventTiming.unit === "ms") {
      let interval = setInterval(() => {
        this.emit("calculating", this.totalSize);
      }, this.options.callbackOptions.eventTiming.value);
      /**
       * store interval id to clear it later.
       * using this.src[0] for storgin interval id.
       * it doesnot matter which index is used since this
       * index is used only for the sake of storing interval
       * on this.files.
       * be sure to use the same index as here while clearing
       * its interval on 'begin' event.
       */
      this.files[this.src[0]] = { intervalID: interval };
    }
    /**
     * this is the initial call to create a list of commands to
     * create dir, copy file(s), logging, and also calculate
     * the overall totalSize of all sources to copy.
     * the overall totalSize is needed to check if all files are
     * processed for 'done' event to be emitted.
     */
    for (let src of this.src) this.startCopy(src, this.dest, true, true);
    // console.log(this.totalSize, "TOTAL", new Date(), this.commands);
    /**
     * 'begin' event is useful to get notified about the overall
     * totalSize of the src to copy. It lets perform certain task
     * once gotten this information.
     * e.g. showing 'calculating total size' message before performing
     * actual operation.
     *
     * It also indicates that the operation has begun.
     */
    this.emit("begin", this.totalSize);
    /**
     * now just execute() all commands if mode is not size.
     * this is also the final initial call made. rest of the
     * operation will be handled by events.
     */
    if (this.options.mode !== "size") this.execute();
    return this;
  };

  /**
   * Starts Copy/Mov(ing) src to dest
   * @private
   * @method
   * @param {string} src source file/folder to copy.
   * @param {string} dest destination folder to copy to.
   * @param {boolean} initialCall if the call is initial, rename
   * source to append ' - Copy' if source and destination directory
   * are the same.
   * initialCall is true for only first level directory so that
   * we can check the src===dest or not.
   * @param {boolean} browseOnly to only browse in order to make
   * a list of commands(create directory, copy file, log).
   * its set to true only in very initial call.
   */
  startCopy(src, dest, initialCall = false, browseOnly = false) {
    // just return if got abortion signal
    if (this.abortOperations) return;
    if (!fs.existsSync(src)) {
      /**
       * check for src existence. it also prevents a file that
       * doesnot exist, to be appended on commands list.
       * also donot push the log command, just log it already.
       */
      if (this.options.log)
        console.log("Source: '" + src + "' not found! It will be skipped!");
      /**
       * adding file to files list to make it comparable for
       * files in queue to be processed if maximum-files-to-process
       * -concurrently is set.
       *
       * Also emit error event immediately for this file instead of
       * pushing it to commands list.
       */
      this.files[src] = { error: { message: "File does not exist!" } };
      this.emit(
        "error",
        {
          file: src,
          totalBytesCopied: this.files[src].totalBytesCopied,
          totalSize: this.files[src].totalSize,
          startTime: this.files[src].startTime,
          endTime: this.files[src].endTime,
          error: this.files[src].error,
        },
        {
          totalBytesCopied: this.totalBytesCopied,
          totalSize: this.totalSize,
        },
        Object.keys(this.files).map((file) => ({
          file: file,
          totalBytesCopied: this.files[file].totalBytesCopied,
          totalSize: this.files[file].totalSize,
          startTime: this.files[file].startTime,
          endTime: this.files[file].endTime,
          error: this.files[file].error,
        }))
      );
      return;
    }
    let srcStat = fs.statSync(src);
    let lastItem = src.split("\\").pop();
    /**
     * if call is initial(not recursive call), check if
     * src===dest. if true, then rename to ' -Copy' before
     * performing operation.
     * Otherwise, there will be no source duplication.
     */
    if (initialCall && src === path.join(dest, lastItem)) {
      if (this.options.mode === "move" && this.options.log) {
        /**
         * skip for 'move' because moving a source to the same
         * destination is meaningless.
         */
        return this.commands.push({
          command: "log",
          message:
            "Skipping moving :: '" + src + "' for having same destination!",
        });
      } else {
        /**
         * if mode is copy.
         * slice to extension if its a file with an extension or
         * leave it as it is to append ' - Copy' everytime the
         * file(s) already exist.
         */
        let finalItemName =
          lastItem.slice(0, lastItem.indexOf(path.extname(lastItem))) ||
          lastItem;
        /**
         * fun part is that below while loop will be true for at
         * least once since src===dest.
         */
        while (
          fs.existsSync(path.join(dest, finalItemName + path.extname(src)))
        )
          finalItemName += " - Copy";
        lastItem = finalItemName + path.extname(src);
      }
    }
    if (srcStat.isDirectory()) {
      /**
       * create the root directory if doesnot exist and if the
       * mode is not size.
       */
      if (
        !fs.existsSync(path.join(dest, lastItem)) &&
        this.options.mode !== "size"
      ) {
        if (this.options.log)
          // command to log
          this.commands.push({
            command: "log",
            message:
              "Creating dir :: '" +
              src +
              "' ---> ' " +
              path.join(dest, lastItem) +
              "'",
          });
        this.commands.push({ command: "md", dir: path.join(dest, lastItem) });
      }
      /**
       * calling this method with current browseOnly value again
       * since its a recursive call and should preserve for this
       * whole call to repeatedly browse untill finished.
       
      * initialCall will be false for every recursive call to
       * avoid indicating that that src===dest for same dest
       *  which could lead in renaming every file/folder to 
       * ' - Copy' instead of only the root file/folder.
       * src will be equals to dest for every recursive call if
       * initialCall is true and source and destination path are
       * the same due to dest being paht.join(dest,lastItem)
       * 
       */
      for (let item of fs.readdirSync(src))
        this.startCopy(
          path.join(src, item),
          path.join(dest, lastItem),
          false,
          browseOnly
        );
    } else {
      /**
       * increment totalSize of whole operation and return by
       * appending copy command for the file to commands list.
       */
      if (browseOnly) {
        this.totalSize += fs.statSync(src).size;
        /**
         * emit 'calculating' event as per the eventTiming
         * configuration.
         *
         * timing unit 'percent' wont be applicable for this event
         * since the totalSize is being calculated.
         *
         * timing option 'forEvery=false' wont be applicable for this
         * event. this event will emit forEvery 'bytes' | 'ms'
         * copied
         */
        if (this.options.callbackOptions.eventTiming.unit === "bytes")
          if (
            this.totalSize >= this.options.callbackOptions.eventTiming.value
          ) {
            // if the event should be emitted repeatedly for every valued bytes
            this.emit("calculating", this.totalSize);
          }
        /**
         * avoid inserting command to commandList if mode
         * is size. its only for the sake of avoiding
         * unnecessary data to be inserted consuming memory
         * since the commands will not execute if the mode
         * is 'size'
         */
        return this.options.mode !== "size"
          ? this.commands.push({
              command: "copy",
              src: src,
              dest: path.join(dest, lastItem),
            })
          : null;
      }
    }
  }

  /**
   * @method
   * @private
   * @param {string} src
   * @param {string} dest
   */
  async copyFile(src, dest) {
    while (
      // if data has been read and no error has occured yet and no abortion
      (this.files[src].bytesRead = fs.readSync(
        this.files[src].srcFile,
        this.files[src].chunkBuffer,
        0,
        this.files[src].chunkBuffer.length,
        this.files[src].totalBytesCopied
      )) &&
      !this.files[src].error &&
      !this.abortOperations
    ) {
      if (!this.files[src].writeStream) {
        /**
         * if stream doesnot exist or is closed because of its
         * deletion due to an error while writing or some other
         * unforseen factors/events.
         * At least, clear the interval for safer side for
         * preventing emmision of event(s) unnecessarily.
         */
        clearInterval(this.files[src].intervalID);
        break;
      }
      if (
        // couldnot write because of buffer full.
        !this.files[src].writeStream.write(
          /**
           * slice only the length of bytesRead avoiding null or
           * empty buffer(s) if there are any due to bytesRead
           * less than chunkSize/buffer length.
           */
          this.files[src].chunkBuffer.slice(0, this.files[src].bytesRead),
          (err) => {
            if (err) {
              // something went wrong
              this.files[src].endTime = new Date();
              this.files[src].writeStream.close();
              this.files[src].writeStream.on("close", () =>
                this.options.log
                  ? console.log(
                      "Aborted",
                      this.options.mode,
                      ":: '" + src + "' with error ::",
                      err.message || err
                    )
                  : null
              );
              this.files[src].error = err;
              // prevent 'progress' event emission
              clearInterval(this.files[src].intervalID);
              this.emit(
                "error",
                {
                  file: src,
                  totalBytesCopied: this.files[src].totalBytesCopied,
                  totalSize: this.files[src].totalSize,
                  startTime: this.files[src].startTime,
                  endTime: this.files[src].endTime,
                  error: this.files[src].error,
                },
                {
                  totalBytesCopied: this.totalBytesCopied,
                  totalSize: this.totalSize,
                },
                Object.keys(this.files).map((file) => ({
                  file: file,
                  totalBytesCopied: this.files[file].totalBytesCopied,
                  totalSize: this.files[file].totalSize,
                  startTime: this.files[file].startTime,
                  endTime: this.files[file].endTime,
                  error: this.files[file].error,
                }))
              );
            } else {
              /**
               * successfully written.
               * put incrementation and copyFile call inside this callback
               * to avoid asynchronous data processing which might lead to
               * misplaced data(without any order) into file.
               */
              this.totalBytesCopied += this.files[src].bytesRead; //overall total
              this.files[src].totalBytesCopied += this.files[src].bytesRead;
              /**
               * progress for unit 'ms' already set to interval/timeout in
               * startCopy method.
               * check for units 'bytes' and 'percent' only for emitting
               * events as per eventTiming options.
               */
              if (this.options.callbackOptions.eventTiming.unit === "bytes") {
                // if the event should be emitted repeatedly for every valued bytes
                if (this.options.callbackOptions.eventTiming.forEvery) {
                  if (
                    this.files[src].lastTimingValue >=
                    this.options.callbackOptions.eventTiming.value
                  ) {
                    this.emit(
                      "progress",
                      {
                        file: src,
                        totalBytesCopied: this.files[src].totalBytesCopied,
                        totalSize: this.files[src].totalSize,
                        startTime: this.files[src].startTime,
                        endTime: this.files[src].endTime,
                        error: this.files[src].error,
                      },
                      {
                        totalBytesCopied: this.totalBytesCopied,
                        totalSize: this.totalSize,
                      },
                      Object.keys(this.files).map((file) => ({
                        file: file,
                        totalBytesCopied: this.files[file].totalBytesCopied,
                        totalSize: this.files[file].totalSize,
                        startTime: this.files[file].startTime,
                        endTime: this.files[file].endTime,
                        error: this.files[file].error,
                      }))
                    );
                    // reset value
                    this.files[src].lastTimingValue = 0;
                  } else
                    this.files[src].lastTimingValue +=
                      this.files[src].bytesRead;
                } else {
                  /**
                   * flagging lastTimingValue -1 to indicate that the
                   * event has been emitted once and should not be emitted
                   * again.
                   */
                  if (this.files[src].lastTimingValue !== -1) {
                    if (
                      this.files[src].lastTimingValue >=
                      this.options.callbackOptions.eventTiming.value
                    ) {
                      this.emit(
                        "progress",
                        {
                          file: src,
                          totalBytesCopied: this.files[src].totalBytesCopied,
                          totalSize: this.files[src].totalSize,
                          startTime: this.files[src].startTime,
                          endTime: this.files[src].endTime,
                          error: this.files[src].error,
                        },
                        {
                          totalBytesCopied: this.totalBytesCopied,
                          totalSize: this.totalSize,
                        },
                        Object.keys(this.files).map((file) => ({
                          file: file,
                          totalBytesCopied: this.files[file].totalBytesCopied,
                          totalSize: this.files[file].totalSize,
                          startTime: this.files[file].startTime,
                          endTime: this.files[file].endTime,
                          error: this.files[file].error,
                        }))
                      );
                      this.files[src].lastTimingValue = -1;
                    } else
                      this.files[src].lastTimingValue +=
                        this.files[src].bytesRead;
                  } // else donot emit event since its already done
                }
              } else if (
                this.options.callbackOptions.eventTiming.unit === "percent"
              ) {
                // if the event should be emitted repeatedly for every valued percent
                if (this.options.callbackOptions.eventTiming.forEvery) {
                  if (
                    this.files[src].lastTimingValue >=
                    this.options.callbackOptions.eventTiming.value
                  ) {
                    this.emit(
                      "progress",
                      {
                        file: src,
                        totalBytesCopied: this.files[src].totalBytesCopied,
                        totalSize: this.files[src].totalSize,
                        startTime: this.files[src].startTime,
                        endTime: this.files[src].endTime,
                        error: this.files[src].error,
                      },
                      {
                        totalBytesCopied: this.totalBytesCopied,
                        totalSize: this.totalSize,
                      },
                      Object.keys(this.files).map((file) => ({
                        file: file,
                        totalBytesCopied: this.files[file].totalBytesCopied,
                        totalSize: this.files[file].totalSize,
                        startTime: this.files[file].startTime,
                        endTime: this.files[file].endTime,
                        error: this.files[file].error,
                      }))
                    );
                    // reset value
                    this.files[src].lastTimingValue = 0;
                  } else
                    this.files[src].lastTimingValue +=
                      (this.files[src].bytesRead / this.files[src].totalSize) *
                      100;
                } else {
                  /**
                   * flagging lastTimingValue -1 to indicate that the
                   * event has been emitted once and should not be emitted
                   * again.
                   */
                  if (this.files[src].lastTimingValue !== -1) {
                    if (
                      this.files[src].lastTimingValue >=
                      this.options.callbackOptions.eventTiming.value
                    ) {
                      this.emit(
                        "progress",
                        {
                          file: src,
                          totalBytesCopied: this.files[src].totalBytesCopied,
                          totalSize: this.files[src].totalSize,
                          startTime: this.files[src].startTime,
                          endTime: this.files[src].endTime,
                          error: this.files[src].error,
                        },
                        {
                          totalBytesCopied: this.totalBytesCopied,
                          totalSize: this.totalSize,
                        },
                        Object.keys(this.files).map((file) => ({
                          file: file,
                          totalBytesCopied: this.files[file].totalBytesCopied,
                          totalSize: this.files[file].totalSize,
                          startTime: this.files[file].startTime,
                          endTime: this.files[file].endTime,
                          error: this.files[file].error,
                        }))
                      );
                      this.files[src].lastTimingValue = -1;
                    } else
                      this.files[src].lastTimingValue +=
                        (this.files[src].bytesRead /
                          this.files[src].totalSize) *
                        100;
                  } // else donot emit event since its already done
                }
              }
              if (
                // file is processed completely and successfully.
                this.files[src].totalSize <= this.files[src].totalBytesCopied
              ) {
                this.files[src].endTime = new Date();
                this.files[src].writeStream.close();
                this.files[src].writeStream.on("close", () => {
                  // actual closing of the destination file
                  if (this.options.log) console.log("Finished ::", src);
                });
              }
              /**
               * calling everytime untill the operation for this
               * file complete either succesfully or not.
               */
              this.copyFile(src, dest);
            }
          }
        )
      ) {
        this.files[src].writeStream.once(
          /**
           * emitted when the operating system flags good to go
           * for continuing operation. Buffer freed ! OH YEAH !!!
           */
          "drain",
          () => this.copyFile(src, dest)
        );
      }
      break;
    }
    /**
     * when operation is in resume mode and full file already exists,
     * while loop breaks in initial call without even executing its
     * body once. It prevents emitting finish event not letting know
     * whether the file processing is complete or not.
     *
     * when operation is not in resume mode, file is processed
     * completely and there is not data to read, a last call of this
     * method is executed after which the while loop breaks
     * without executing its body as if it was in resume mode.
     *
     * This condition below is to verify file's process completion
     * for emitting the 'finish' event only once. Otherwise, if
     * somehow, the 'finish' event is emitted more than once for the
     * same file, it might lead to emission of the 'done' event more
     * than once.
     */
    if (this.files[src].totalSize <= this.files[src].totalBytesCopied)
      this.emit(
        "finish",
        {
          file: src,
          totalBytesCopied: this.files[src].totalBytesCopied,
          totalSize: this.files[src].totalSize,
          startTime: this.files[src].startTime,
          endTime: this.files[src].endTime,
          error: this.files[src].error,
        },
        {
          totalBytesCopied: this.totalBytesCopied,
          totalSize: this.totalSize,
        },
        Object.keys(this.files).map((file) => ({
          file: file,
          totalBytesCopied: this.files[file].totalBytesCopied,
          totalSize: this.files[file].totalSize,
          startTime: this.files[file].startTime,
          endTime: this.files[file].endTime,
          error: this.files[file].error,
        }))
      );
  }

  /**
   * no params no nothing. just execute a set of commands untill
   * the maxConcurrent threshold exceeds. it will get executed
   * initially by start() method. after the initial start, every
   * finish event will call this method untill no operation is
   * left to execute.
   * @private
   * @returns nothing. absolutely nothing.
   */
  execute = () => {
    let indexOfCommand = -1;
    for (let command of this.commands) {
      indexOfCommand += 1;
      if (command)
        switch (command.command) {
          case "log":
            console.log(command.message);
            break;
          case "md":
            fs.mkdirSync(command.dir, {
              recursive: false,
            });
            break;
          case "copy":
            /**
             * concurrency limit exceeded or the file already
             * has a record of operation.
             */
            if (
              (this.options.maxConcurrentOperation !== 0 &&
                this.filesInOperation.length >=
                  this.options.maxConcurrentOperation) ||
              this.files[command.src]
            )
              return;
            /**
             * if everything is fine till now, put the file in operation
             * list.
             */
            let srcStat = fs.statSync(command.src);
            this.filesInOperation.push(command.src);
            let destStat = { size: 0 };
            if (this.options.resume) {
              if (fs.existsSync(command.dest))
                destStat = fs.statSync(command.dest);
              this.totalBytesCopied += destStat.size;
            }
            // add new file and its properties to the list.
            this.files[command.src] = {
              /**
               * srcFile valued fs.openSync is used to avoid calling the
               * method everytime the data needs to be read before
               * completion.
               */
              srcFile: fs.openSync(command.src, "r"),
              /**
               * the writeStream of a file.
               * it gets closed and deleted if operation is completed
               * with or without success.
               */
              writeStream: fs.createWriteStream(command.dest, {
                flags: this.options.resume
                  ? destStat.size <= srcStat.size
                    ? "a"
                    : "w"
                  : "w",
              }),
              // chunkBuffer to hold the data for every read
              chunkBuffer: Buffer.alloc(this.options.chunkSize),
              bytesRead: 0, // for denoting how much bytes are read at a time
              // totalBytesCopied also acts as a position index in a file.
              totalBytesCopied: this.options.resume
                ? destStat.size <= srcStat.size
                  ? destStat.size
                  : 0
                : 0,
              totalSize: srcStat.size, // totalSize of a file
              startTime: null,
              endTime: null,
              error: null, // any system error or user abortion message
              // used for eventTiming units 'bytes' and 'percent' to emit 'progress' event
              lastTimingValue: 0,
              intervalID: null,
            };
            this.files[command.src].writeStream.on("open", () => {
              // only operate after file has been opened
              // push the file to filesInOperation for tracking
              if (this.options.log)
                console.log(
                  "Copying file :: '" +
                    command.src +
                    "' ---> '" +
                    command.dest +
                    "'"
                );
              this.files[command.src].startTime = new Date();
              // eventTiming for unit 'ms'/default
              if (this.options.callbackOptions.eventTiming.unit === "ms") {
                // whether progress event should emit only once or every value miliseconds
                if (this.options.callbackOptions.eventTiming.forEvery) {
                  let interval = setInterval(() => {
                    this.emit(
                      "progress",
                      {
                        file: command.src,
                        totalBytesCopied:
                          this.files[command.src].totalBytesCopied,
                        totalSize: this.files[command.src].totalSize,
                        startTime: this.files[command.src].startTime,
                        endTime: this.files[command.src].endTime,
                        error: this.files[command.src].error,
                      },
                      {
                        totalBytesCopied: this.totalBytesCopied,
                        totalSize: this.totalSize,
                      },
                      Object.keys(this.files).map((file) => ({
                        file: file,
                        totalBytesCopied: this.files[file].totalBytesCopied,
                        totalSize: this.files[file].totalSize,
                        startTime: this.files[file].startTime,
                        endTime: this.files[file].endTime,
                        error: this.files[file].error,
                      }))
                    );
                  }, this.options.callbackOptions.eventTiming.value);
                  // store interval id to clear it later
                  this.files[command.src].intervalID = interval;
                } else
                  setTimeout(() => {
                    /**
                     * check if operation has been completed either
                     * successfully or not before this timeout is
                     * executed, this prevents from event getting fired.
                     *
                     * no need to check for timeInterval though since
                     * it is cleaned at the time of abortion, error
                     * or on 'done' event.
                     */
                    if (
                      !this.files[command.src].error ||
                      this.files[command.src].totalSize <=
                        this.files[command.src].totalBytesCopied
                    )
                      this.emit(
                        "progress",
                        {
                          file: command.src,
                          totalBytesCopied:
                            this.files[command.src].totalBytesCopied,
                          totalSize: this.files[command.src].totalSize,
                          startTime: this.files[command.src].startTime,
                          endTime: this.files[command.src].endTime,
                          error: this.files[command.src].error,
                        },
                        {
                          totalBytesCopied: this.totalBytesCopied,
                          totalSize: this.totalSize,
                        },
                        Object.keys(this.files).map((file) => ({
                          file: file,
                          totalBytesCopied: this.files[file].totalBytesCopied,
                          totalSize: this.files[file].totalSize,
                          startTime: this.files[file].startTime,
                          endTime: this.files[file].endTime,
                          error: this.files[file].error,
                        }))
                      );
                  }, this.options.callbackOptions.eventTiming.value);
              }
              // initial call for this src.
              this.copyFile(command.src, command.dest);
            });
            break;
          default:
            break;
        }
      /**
       * delete command from the list because there is
       * no good reason not to.
       */
      delete this.commands[indexOfCommand];
    }
  };

  /**
   * @method
   * @param {Array<string> | string | null} file if filename is passed, abortion
   * for that file will be applied else for all operation will be
   * applied. 'aborted' event with file(s) data will be emitted.
   */
  abortOperation = (file = null) => {
    this.abortOperations = true;
    if (file) {
      // validate argument to array
      if (typeof file === "string") file = [file];
      else if (typeof file === "object" && file.length) file = file;
      else
        throw new Error(
          "Argument error! Length of file is 0 or invalid argument type!"
        );
      /**
       * abort files by error'ing the file and also remove this
       * file's command from command list using abortCommandIndex
       * to avoid calling indexOf method of commands list find
       * the index of the command to remove.
       */
      let abortCommandIndex;
      for (let src of file) {
        abortCommandIndex = -1; // reset
        if (src && src in this.files) {
          this.files[src].error = { message: "Operation aborted manually!" };
          let operationList = []; // temporary list of currentOperation
          // remove this file from filesInOperation list
          this.filesInOperation.map((file) =>
            file === src ? operationList.push(file) : null
          );
          this.filesInOperation = operationList;
          // clear interval for this file
          clearInterval(this.files[src].intervalID);
        }
        for (let command of this.commands) {
          abortCommandIndex += 1;
          if (command.src === file) {
            delete this.commands[abortCommandIndex];
            break; // break to avoid looping over every item
          }
        }
      }
    } else {
      /**
       * abort all existing in-process files avoiding the those
       * which are completed for preventing setting error flag
       * even if its completed successfully.
       *
       * file's totalBytesCopied < file's totalSize without any
       * error means it's under operation because if those are not
       * true, then that means operation of that file is complete
       * with or without any error.
       */
      for (let src of Object.keys(this.files)) {
        /**
         * abort/errorify only for processing files otherwise a
         * file could be successfully processed but still have
         * this error.
         */
        if (
          // this.files[src].totalBytesCopied < this.files[src].totalSize && !this.files[src].error
          this.filesInOperation.indexOf(src) !== -1
        ) {
          // file is under processing
          this.files[src].error = { message: "Operation aborted manually!" };
          let operationList = []; // temporary list of currentOperation
          // remove this file from filesInOperation list
          this.filesInOperation.map((file) =>
            file === src ? operationList.push(file) : null
          );
          this.filesInOperation = operationList;
          this.commands = [];
        }
        /**
         * clear interval for every files just to be sure even
         * if files are processed and no interval are pending.
         */
        clearInterval(this.files[src].intervalID);
      }
    }
    this.emit(
      "aborted",
      file || Object.keys(this.files),
      {
        totalBytesCopied: this.totalBytesCopied,
        totalSize: this.totalSize,
      },
      Object.keys(this.files).map((file) => ({
        file: file,
        totalBytesCopied: this.files[file].totalBytesCopied,
        totalSize: this.files[file].totalSize,
        startTime: this.files[file].startTime,
        endTime: this.files[file].endTime,
        error: this.files[file].error,
      }))
    );
  };

  /**
   * @method
   * @returns { { totalBytesCopied: number, totalSize: number } }
   * totalBytesCopied and totalSize of the source path
   */
  getOverallSizes = () => {
    return {
      totalBytesCopied: this.totalBytesCopied,
      totalSize: this.totalSize,
    };
  };

  /**
   * @method
   * @returns { false | { file: string, totalBytesCopied: number,
        totalSize: number, startTime: Date, endTime: Date,
        error?: Error | null, } | Array<{ file: string,
        totalBytesCopied: number, totalSize: number, startTime: Date,
        endTime: Date, error?: Error | null, }> } object if file string 
        is specified, false if file string is specified but not found 
        in files list, and array of an object if file string is null
      @param {string | null} file could be string or null
   */
  getProgress = (file = null) =>
    file
      ? file in this.files
        ? {
            file: file,
            totalBytesCopied: this.files[file].totalBytesCopied,
            totalSize: this.files[file].totalSize,
            startTime: this.files[file].startTime,
            endTime: this.files[file].endTime,
            error: this.files[file].error,
          }
        : false
      : Object.keys(this.files).map((file) => {
          return {
            file: file,
            totalBytesCopied: this.files[file].totalBytesCopied,
            totalSize: this.files[file].totalSize,
            startTime: this.files[file].startTime,
            endTime: this.files[file].endTime,
            error: this.files[file].error,
          };
        });

  /**
   * @method
   * @returns { { src: Array<string>, dest: string,
   * log: boolean, resume: boolean, chunkSize: number,
   * mode: 'copy' | 'move' | 'size', maxConcurrentOperation: boolean,
   * abortAllOnError: boolean, callbackOptions: { callbacks:
   * Array<{ event: 'calculating' | 'begin' | 'progress' |
   * 'finish' | 'done' | 'error',
   * callback: ( overallSize: { totalBytesCopied: number, totalSize: number }, files:
   * [ { file: string, totalBytesCopied: number, totalSize: number,
   * startTime: Date, endTime: Date, error: Error } ] ) =>{} }>,
   * eventTiming: { value: number, unit: 'ms' | 'percent' | 'bytes',
   * forEvery: boolean } } } } options passed during construction
   */
  getRegisteredOptions = () => ({
    src: this.src,
    dest: this.dest,
    ...this.options,
  });

  /**
   *
   * @returns { Array<string> }
   */
  getFilesInOperation = () => this.filesInOperation;

  /**
   * @example console.log(getSizeOf("path\\directory or file")) // 12345
   * @param {string} pathname full file or directory path
   * @returns {number} size of the path in bytes
   */
  static getSizeOf = (pathname) => {
    let size = 0,
      stat = { size: 0 };
    try {
      if (fs.existsSync(pathname)) stat = fs.statSync(pathname);
      if (stat && stat.isDirectory && stat.isDirectory())
        for (let item of fs.readdirSync(pathname)) {
          size += this.getSizeOf(path.join(pathname, item));
        }
      else size = stat.size;
    } catch (err) {}
    return size;
  };

  /**
   * @example console.log(sizify(12345)) // [ 12.0556640625, 'KB' ]
   * @param {number} size number of size in bytes
   * @param {number} fix float precision to fix to.
   * @returns {[number,string]} number and unit of size in an array
   */
  static sizify = (size, fix) => {
    let data = [0, "bytes"];
    if (size <= 1024) data = [size, "bytes"];
    else if (size <= 1024 ** 2) data = [size / 1024, "KB"];
    else if (size <= 1024 ** 3) data = [size / 1024 ** 2, "MB"];
    else if (size <= 1024 ** 4) data = [size / 1024 ** 3, "GB"];
    else if (size <= 1024 ** 5) data = [size / 1024 ** 4, "TB"];
    if (fix) data[0] = parseFloat(data[0]).toFixed(fix);
    return data;
  };
}

module.exports = { DaemonicProgress };
