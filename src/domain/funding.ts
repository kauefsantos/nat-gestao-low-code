export type FundingSource = "owner" | "business";

export const fundingSourceLabel: Record<FundingSource,string> = {
  owner: "Dinheiro pessoal (Kauê/Natalia)",
  business: "Dinheiro da NAT",
};

export type FundingSummary = {
  ownerContributions:number;
  ownerWithdrawals:number;
  ownerFundedOutflows:number;
  businessReinvestment:number;
  businessReinvestmentPurchases:number;
  businessReinvestmentExpenses:number;
  monthOwnerFundedOutflows:number;
  monthBusinessReinvestment:number;
  fixedCostFundingSource:FundingSource;
  supplyFunding:Record<string,FundingSource>;
  expenseFunding:Record<string,FundingSource>;
};

export const emptyFundingSummary = ():FundingSummary => ({
  ownerContributions:0,
  ownerWithdrawals:0,
  ownerFundedOutflows:0,
  businessReinvestment:0,
  businessReinvestmentPurchases:0,
  businessReinvestmentExpenses:0,
  monthOwnerFundedOutflows:0,
  monthBusinessReinvestment:0,
  fixedCostFundingSource:"owner",
  supplyFunding:{},
  expenseFunding:{},
});
