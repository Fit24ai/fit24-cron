import { Injectable } from '@nestjs/common';
import { EthersService } from 'src/ethers/ethers.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { formatUnits } from 'ethers';

const ether = new EthersService();
@Injectable()
export class ContractService {
  public icoContract = ether.icoContract;
  public signedIcoContract = ether.signedIcoContract;

  // public async readOnly() {
  //   const users = await this.icoContract.getAllUsers();
  //   if (users) {
  //     users.map((item) => {
  //       console.log('user', item);
  //       const userActiveStakes = async () => {
  //         const activeStakes = await this.icoContract.getUserActiveStakes(item);
  //         console.log('activeStakes', activeStakes);
  //         const idToStake = await this.icoContract.idToStake('1');
  //         if (idToStake) {
  //           console.log('idToStake', idToStake);
  //           let poolTime = formatUnits(idToStake[3], 0);
  //           console.log('poolTime', poolTime);
  //           const stakeDuration =
  //             await this.icoContract.stakeDuration(poolTime);
  //           console.log(stakeDuration);
  //           const time = stakeDuration + idToStake[4];
  //           console.log('time', time);
  //           const blockTimestamp = (await ether.provider.getBlock('latest'))
  //             .timestamp;
  //           console.log('blockTimestamp', BigInt(blockTimestamp));
  //           if (time < blockTimestamp) {
  //             console.log("Continue");
  //           }else{
  //               console.log("Dont Continue")
  //           }
  //         }
  //       };
  //       userActiveStakes();
  //     });
  //   }
  // }

  public u = [
    '0x50Ca1fde29D62292a112A72671E14a5d4f05580f',
    '0x50Ca1fde29D62292a112A72671E14a',
    '0x50Ca1fde29D62292a112A72671E14a5d4f05580f',
  ];

  public async getActiveStakesOfUser(user) {
    try {
      return await this.icoContract.getUserActiveStakes(user);
    } catch (error) {
      console.error('Could not find user active stakes:');
      return [];
    }
  }

  public async processWithdrawTokens(activeStake, user) {
    console.log(user, Number(formatUnits(activeStake, 0)));
    try {
      
      const withdraw = await this.signedIcoContract.withdrawUserTokens(
        user,
        Number(formatUnits(activeStake, 0)),
      );
    } catch (error) {
      console.log("withdraw Unsuccessfull", error);
    }
  }

  public async processStake(activeStake, user) {
    try {
      console.log('stake', activeStake);
      const idToStake = await this.icoContract.idToStake(activeStake);
      if (!idToStake) {
        return;
      }

      const poolType = formatUnits(idToStake[3], 0);
      const stakeDuration = await this.icoContract.stakeDuration(poolType);
      const blockTimestamp = BigInt(
        (await ether.provider.getBlock('latest')).timestamp,
      );
      const stakeEndTime = stakeDuration + idToStake[4];

      console.log('blockTimestamp', blockTimestamp);
      console.log('stakeEndTime', stakeEndTime);

      if (stakeEndTime < blockTimestamp) {
        console.log('Continue');
        this.processWithdrawTokens(activeStake, user);
      } else {
        console.log("Don't Continue");
        // this.processWithdrawTokens(activeStake, user);
      }
    } catch (error) {
      console.error('Error processing stake:');
    }
  }

  public async handleActiveStakes(activeStakes, user) {
    for (const activeStake of activeStakes) {
      await this.processStake(activeStake, user);
    }
  }

  public async readOnly() {
    try {
      const users = await this.icoContract.getAllUsers();
      if (!users) {
        return;
      }
      for (const user of users) {
        console.log('user:', user);
        const activeStakes = await this.getActiveStakesOfUser(user);
        if (activeStakes.length > 0) {
          console.log('Active stakes found');
          console.log(activeStakes);
          await this.handleActiveStakes(activeStakes, user);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  private hasRun = false;

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    if (this.hasRun) {
      return;
    }

    this.hasRun = true;

    console.log('Hello Ethers');
    // await this.signedIcoContract.claimTreasuryReward();
    await this.readOnly();
  }
}

// if (users) {
//   console.log('No. of users : ', users.length);
//   for (const user of users) {
//     console.log('user', user);

//     const [activeStakes, block] = await Promise.all([
//       this.icoContract.getUserActiveStakes(user),
//       // this.icoContract.idToStake('1'),
//       ether.provider.getBlock('latest'),
//     ]);

//     if (activeStakes) {
//       console.log('activeStakes', activeStakes);

//       for (const activestake of activeStakes) {
//         console.log('Particular activestake', activestake);
//         const idToStake = await this.icoContract.idToStake(activestake);
//         if (idToStake) {
//           console.log('idToStake', idToStake);

//           let poolType = formatUnits(idToStake[3], 0);
//           console.log('poolTime', poolType);

//           const stakeDuration =
//             await this.icoContract.stakeDuration(poolType);
//           console.log('stakeDuration', stakeDuration);

//           const time = stakeDuration + idToStake[4];
//           console.log('time', time);

//           const blockTimestamp = BigInt(block.timestamp);
//           console.log('blockTimestamp', blockTimestamp);

//           if (time < blockTimestamp) {
//             console.log('Continue');
//           } else {
//             console.log("Don't Continue");
//           }
//         }
//       }
//     }
//   }
// }
