
/**
 * slice() reference.
 */

var slice = Array.prototype.slice;

/**
 * Expose `co`.
 */

module.exports = co['default'] = co.co = co;

/**
 * Wrap the given generator `fn` into a
 * function that returns a promise.
 * This is a separate function so that
 * every `co()` call doesn't create a new,
 * unnecessary closure.
 *
 * @param {GeneratorFunction} fn
 * @return {Function}
 * @api public
 */

co.wrap = function (fn) {
  createPromise.__generatorFunction__ = fn;
  return createPromise;
  function createPromise() {
    return co.call(this, fn.apply(this, arguments));
  }
};

/**
 * Execute the generator function or a generator
 * and return a promise.
 * 执行传入的 generator 函数或者 generator 对象，返回一个 promise
 * 在 4.0 之前是返回一个 thunk
 *
 * @param {Function} fn
 * @return {Promise}
 * @api public
 */

function co(gen) {
  //  ^-^ 0. 子弹进入弹夹
  var ctx = this;
  var args = slice.call(arguments, 1);

  // we wrap everything in a promise to avoid promise chaining,
  // which leads to memory leak errors.
  // see https://github.com/tj/co/issues/180
  return new Promise(function(resolve, reject) {

    /**
     * 如果是一个函数，则带上参数执行
     * 注意：此处并不判断 gen 是否是一个 generator 函数，因为下一步会判断其返回值是否是 generator 对象
     * 题外话：实际上也没有必要判断一个函数是否是 generator 函数
     * 参考：https://stackoverflow.com/questions/16754956/check-if-function-is-a-generator
     * We talked about this in the TC39 face-to-face meetings and it is deliberate that
     * we don't expose a way to detect whether a function is a generator or not.
     * The reason is that any function can return an iterable object so it does not
     * matter if it is a function or a generator function.
     */
    if (typeof gen === 'function') gen = gen.apply(ctx, args);

    /**
     * 此处期待 gen 应该是一个 generator 对象或者可迭代对象，否则直接 resolve
     */
    if (!gen || typeof gen.next !== 'function') return resolve(gen);

    // 触发首次迭代
    //  ^-^ 1. 扣动扳机，激发第一颗子弹
    onFulfilled();

    /**
     * @param {Mixed} res
     * @return {Promise}
     * @api private
     */
    // 迭代 generator 对象，处理迭代结果（将结果带入下一次迭代）
    function onFulfilled(res) {
      var ret;
      try {
        //  ^-^ 2. 子弹射出
        ret = gen.next(res);
      } catch (e) {
        return reject(e);
      }

      // 处理迭代结果
      // ^-^ 3. 反冲力让下一颗子弹上膛
      next(ret);
      return null;
    }

    /**
     * @param {Error} err
     * @return {Promise}
     * @api private
     */

    function onRejected(err) {
      var ret;
      try {
        ret = gen.throw(err);
      } catch (e) {
        return reject(e);
      }
      next(ret);
    }

    /**
     * Get the next value in the generator,
     * return a promise.
     *
     * @param {Object} ret
     * @return {Promise}
     * @api private
     */

    function next(ret) {
      /**
       * 如果迭代结束，resolve 并返回，这也是 co 的最终目标：generator 对象迭代结束，
       * 并 resolve 最后的值
       */
      //  ^-^ 4. 子弹打光
      if (ret.done) return resolve(ret.value);

      /**
       * 还未迭代结束，继续
       * 将迭代过程中的 ret.value 转化为 promise，继续迭代，toPromise函数式关键
       */
      var value = toPromise.call(ctx, ret.value);
      //  ^-^ 5. 撞针撞击上膛的子弹
      if (value && isPromise(value)) return value.then(onFulfilled, onRejected);
      //  ^-^ 6. 碰到一颗木头做的子弹，卡克
      return onRejected(new TypeError('You may only yield a function, promise, generator, array, or object, '
        + 'but the following object was passed: "' + String(ret.value) + '"'));
    }
  });
}

/**
 * Convert a `yield`ed value into a promise.
 *
 * @param {Mixed} obj
 * @return {Promise}
 * @api private
 */

function toPromise(obj) {
  if (!obj) return obj;
  if (isPromise(obj)) return obj;
  if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);
  if ('function' == typeof obj) return thunkToPromise.call(this, obj);
  if (Array.isArray(obj)) return arrayToPromise.call(this, obj);
  if (isObject(obj)) return objectToPromise.call(this, obj);
  return obj;
}

/**
 * Convert a thunk to a promise.
 *
 * @param {Function}
 * @return {Promise}
 * @api private
 */

function thunkToPromise(fn) {
  var ctx = this;
  return new Promise(function (resolve, reject) {
    fn.call(ctx, function (err, res) {
      if (err) return reject(err);
      if (arguments.length > 2) res = slice.call(arguments, 1);
      resolve(res);
    });
  });
}

/**
 * Convert an array of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 *
 * @param {Array} obj
 * @return {Promise}
 * @api private
 */

function arrayToPromise(obj) {
  return Promise.all(obj.map(toPromise, this));
}

/**
 * Convert an object of "yieldables" to a promise.
 * Uses `Promise.all()` internally.
 * 将 object 中所有 property 转化为 promise
 * 会递归调用 toPromise 层层转化
 * @param {Object} obj
 * @return {Promise}
 * @api private
 */
function objectToPromise(obj){
  var results = new obj.constructor();
  var keys = Object.keys(obj);
  var promises = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var promise = toPromise.call(this, obj[key]);
    if (promise && isPromise(promise)) defer(promise, key);
    else results[key] = obj[key];
  }
  return Promise.all(promises).then(function () {
    return results;
  });

  function defer(promise, key) {
    // predefine the key in the result
    results[key] = undefined;
    promises.push(promise.then(function (res) {
      results[key] = res;
    }));
  }
}

/**
 * Check if `obj` is a promise.
 *
 * @param {Object} obj
 * @return {Boolean}
 * @api private
 */

function isPromise(obj) {
  return 'function' == typeof obj.then;
}

/**
 * Check if `obj` is a generator.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */

function isGenerator(obj) {
  return 'function' == typeof obj.next && 'function' == typeof obj.throw;
}

/**
 * Check if `obj` is a generator function.
 *
 * @param {Mixed} obj
 * @return {Boolean}
 * @api private
 */
 
function isGeneratorFunction(obj) {
  var constructor = obj.constructor;
  if (!constructor) return false;
  if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
  return isGenerator(constructor.prototype);
}

/**
 * Check for plain object.
 *
 * @param {Mixed} val
 * @return {Boolean}
 * @api private
 */

function isObject(val) {
  return Object == val.constructor;
}
