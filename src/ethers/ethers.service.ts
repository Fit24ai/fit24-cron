import { Injectable } from '@nestjs/common';
import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import {
  BuyContract,
  IcoContract,
  binancePaymentContractAddress,
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
  // public binanceProvider = new JsonRpcProvider(
  //   'https://bsc-testnet-rpc.publicnode.com',
  // );
  // public ethereumProvider = new JsonRpcProvider(
  //   'https://bsc-testnet-rpc.publicnode.com',
  // );
  public binanceProvider = new JsonRpcProvider(
    process.env.BINANCE_RPC_PROVIDER,
  );

  public ethereumProvider = new JsonRpcProvider(
    process.env.ETHEREUM_RPC_PROVIDER,
  );
  public blokfitProvider = new JsonRpcProvider(
    process.env.BLOKFIT_RPC_PROVIDER,
  );
  

  // private readonly signer = new Wallet(process.env.PRIVATE_KEY, this.binanceProvider);
  private readonly signer = new Wallet(process.env.PRIVATE_KEY, this.blokfitProvider);

  public icoContract = new Contract(StakingContract, stakingAbi, this.blokfitProvider);
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
    binancePaymentContractAddress,
    paymentAbi,
    this.binanceProvider,
  );
  public buyContract = new Contract(
    BuyContract,
    buyAbi,
    this.binanceProvider,
  );

  public icoInterface = new Interface(icoAbi);

  public stakingInterface = new Interface(stakingAbi);

  public buyInterface = new Interface(buyAbi);

  public paymentInterface = new Interface(paymentAbi);


  public binanceStakingContract = new Contract(
    StakingContract,
    stakingAbi,
    this.binanceProvider,
  );
}
