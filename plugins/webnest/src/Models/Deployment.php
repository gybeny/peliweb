<?php

namespace WebNest\Models;

use Illuminate\Database\Eloquent\Model;

class Deployment extends Model
{
    protected $table = 'webnest_deployments';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected function casts(): array { return ['snapshot' => 'array']; }
}
