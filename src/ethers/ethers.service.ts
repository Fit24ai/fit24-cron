import { Injectable } from '@nestjs/common';
import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import {
  BuyContract,
  IcoContract,
  paymentContractAddress,
  StakingContract,
} from './libs/contract';
import { icoAbi } from './libs/abi/icoAbi';
import { config } from 'dotenv';
import stakingAbi from './libs/abi/stakingAbi';
import { paymentAbi } from './libs/abi/paymentAbi';
import { buyAbi } from './libs/abi/buyAbi';

config();

@Injectable()
export class EthersService {
  public provider = new JsonRpcProvider(
    'https://bsc-testnet-rpc.publicnode.com',
  );


  private readonly signer = new Wallet(process.env.PRIVATE_KEY, this.provider);

  public icoContract = new Contract(StakingContract, stakingAbi, this.provider);
  public signedIcoContract = new Contract(
    StakingContract,
    stakingAbi,
    this.signer,
  );
  public signedBuyIcoContract = new Contract(
    BuyContract,
    buyAbi,
    this.signer,
  );

  public paymentContract = new Contract(
    paymentContractAddress,
    paymentAbi,
    this.provider,
  );
  public buyContract = new Contract(
    BuyContract,
    buyAbi,
    this.provider,
  );

  public icoInterface = new Interface(icoAbi);

  public stakingInterface = new Interface(stakingAbi);

  public buyInterface = new Interface(buyAbi);

  public paymentInterface = new Interface(paymentAbi);

  public readonly binanceProvider = new JsonRpcProvider(
    process.env.BINANCE_PRC_PROVIDER,
  );

  public binanceStakingContract = new Contract(
    StakingContract,
    stakingAbi,
    this.provider,
  );
}
