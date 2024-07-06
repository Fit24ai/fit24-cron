import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AppService {
  // getHello(): string {
  //   return 'Hello World!';
  // }
  @Cron(CronExpression.EVERY_5_SECONDS)
  handleCron() {
    console.log('Hello Bhai');
  }
}
