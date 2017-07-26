'use strick';

module.exports = app => {
  return class HomeController {
    async index() {
      console.log('hello loader!');
    }
  }
};
