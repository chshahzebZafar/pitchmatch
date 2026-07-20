import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class RevealDto {
  @ApiProperty({ description: 'User to reveal' })
  @IsString()
  userId: string;
}

export class PurchaseDto {
  @ApiProperty({ description: 'Play Console product id, e.g. credits_10' })
  @IsString()
  @MaxLength(120)
  productId: string;

  @ApiProperty({ description: 'purchaseToken from Google Play Billing' })
  @IsString()
  @MaxLength(512)
  purchaseToken: string;
}

export class AdjustCreditsDto {
  @ApiProperty({ description: 'Positive to grant, negative to deduct' })
  @IsInt()
  delta: number;

  @ApiProperty({ required: false, description: 'Why — stored on the ledger row' })
  @IsString()
  @MaxLength(200)
  note: string;
}

export class CreditPackDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  credits: number;
}
