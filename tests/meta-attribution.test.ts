import { describe, expect, it } from 'vitest';
import { metaWhatsAppAttribution } from '../lib/server/meta-attribution';

describe('Meta WhatsApp Click-to-WhatsApp attribution', () => {
  it('keeps regular WhatsApp messages separate from ads', () => {
    expect(metaWhatsAppAttribution('12345', undefined)).toEqual({
      source: 'WhatsApp',
      attribution: { meta_phone_number_id: '12345' }
    });
  });

  it('stores only the ad attribution identifiers from a referral', () => {
    expect(metaWhatsAppAttribution('12345', {
      source_type: 'ad',
      source_id: '12001234',
      ctwa_clid: 'click-123',
      source_url: 'https://fb.me/example',
      headline: 'Sensitive creative that must not be saved',
      body: 'Do not save this text'
    })).toEqual({
      source: 'Meta Click-to-WhatsApp Ads',
      attribution: {
        meta_phone_number_id: '12345',
        meta_referral_type: 'ad',
        meta_ad_source_id: '12001234',
        meta_ctwa_clid: 'click-123',
        meta_referral_url: 'https://fb.me/example'
      }
    });
  });

  it('ignores unknown and oversize fields without throwing', () => {
    expect(metaWhatsAppAttribution('12345', {
      source_type: 'post',
      source_id: 'x'.repeat(1000),
      ctwa_clid: 123,
      arbitrary: 'not stored'
    })).toEqual({
      source: 'Meta WhatsApp Post',
      attribution: {
        meta_phone_number_id: '12345',
        meta_referral_type: 'post'
      }
    });
  });
});
