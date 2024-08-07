import { Injectable } from '@nestjs/common';
import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import { IcoContract, StakingContract } from './libs/contract';
import { icoAbi } from './libs/abi/icoAbi';
import { config } from 'dotenv';
import stakingAbi from './libs/abi/stakingAbi';

config();

@Injectable()
export class EthersService {
  public provider = new JsonRpcProvider(
    'https://bsc-testnet-rpc.publicnode.com',
  );

  private readonly signer = new Wallet(process.env.PRIVATE_KEY, this.provider);

  public icoContract = new Contract(StakingContract, stakingAbi, this.provider);
  public signedIcoContract = new Contract(StakingContract, stakingAbi, this.signer);

  public icoInterface = new Interface(icoAbi);

  public stakingInterface  = new Interface(stakingAbi);

  public binanceStakingContract =  new Contract(StakingContract,stakingAbi,this.provider)


}
