import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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

export class CreateOrderDto {
  @ApiProperty({ description: 'Credit pack product id, e.g. credits_20' })
  @IsString()
  @MaxLength(120)
  productId: string;
}

export class CaptureOrderDto {
  @ApiProperty({ description: 'Order id returned by /credits/checkout' })
  @IsString()
  @MaxLength(512)
  orderId: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Set false to simulate the buyer cancelling, so the client error path can be tested',
  })
  @IsOptional()
  @IsBoolean()
  approve?: boolean;
}
